#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import venv
import uuid
from pathlib import Path
from urllib.parse import quote
import urllib.request


DEFAULT_BUCKET = "visual-intelligence-app-p113-site-artifacts-asia-east1"
DEFAULT_CREDENTIALS_PATH = "/workspace/gcp-key.json"
DEFAULT_VENV = Path(os.getenv("POLYVERSE_GCS_UPLOAD_VENV", "/tmp/polyverse-gcs-upload-venv"))


def add_venv_site_packages(venv_python: Path) -> None:
    output = subprocess.check_output(
        [
            venv_python.as_posix(),
            "-c",
            "import json, site; print(json.dumps(site.getsitepackages()))",
        ],
        text=True,
    )
    for item in json.loads(output):
        if item not in sys.path:
            sys.path.insert(0, item)


def ensure_python_storage_dependency() -> None:
    install_cmd = [sys.executable, "-m", "pip", "install", "--user", "google-cloud-storage"]
    try:
        subprocess.check_call(install_cmd, stdout=sys.stderr)
        return
    except subprocess.CalledProcessError:
        pass

    venv_python = DEFAULT_VENV / "bin" / "python"
    if not venv_python.exists():
        venv.EnvBuilder(with_pip=True).create(DEFAULT_VENV)
    subprocess.check_call(
        [venv_python.as_posix(), "-m", "pip", "install", "google-cloud-storage"],
        stdout=sys.stderr,
    )
    add_venv_site_packages(venv_python)


def import_storage(install_deps: bool):
    try:
        from google.cloud import storage  # type: ignore
        from google.oauth2 import service_account  # type: ignore

        return storage, service_account
    except ImportError:
        if not install_deps:
            raise
        ensure_python_storage_dependency()
        from google.cloud import storage  # type: ignore
        from google.oauth2 import service_account  # type: ignore

        return storage, service_account


def default_object_name(zip_path: Path) -> str:
    upload_id = os.getenv("POLYVERSE_ARTIFACT_UPLOAD_ID") or os.getenv("P113_ARTIFACT_UPLOAD_ID") or uuid.uuid4().hex
    return f"uploads/{upload_id}/{zip_path.name}"


def upload_with_gcloud(*, zip_path: Path, bucket: str, object_name: str, credentials_path: Path, project: str | None) -> bool:
    gcloud = shutil.which("gcloud")
    if not gcloud:
        return False
    config_dir = Path(os.getenv("CLOUDSDK_CONFIG") or f"/tmp/polyverse-gcloud-{uuid.uuid4().hex}")
    command_env = os.environ.copy()
    command_env["CLOUDSDK_CONFIG"] = config_dir.as_posix()
    activate = [
        gcloud,
        "auth",
        "activate-service-account",
        "--key-file",
        credentials_path.as_posix(),
    ]
    copy = [
        gcloud,
        "storage",
        "cp",
        zip_path.as_posix(),
        f"gs://{bucket}/{object_name}",
    ]
    if project:
        activate.extend(["--project", project])
        copy.extend(["--project", project])
    subprocess.check_call(activate, env=command_env, stdout=sys.stderr)
    subprocess.check_call(copy, env=command_env)
    return True


def upload_with_bearer_token(*, zip_path: Path, bucket: str, object_name: str, bearer_token: str) -> bool:
    token = bearer_token.strip()
    if not token:
        return False
    url = (
        f"https://storage.googleapis.com/upload/storage/v1/b/{quote(bucket, safe='')}/o"
        f"?uploadType=media&name={quote(object_name, safe='')}"
    )
    request = urllib.request.Request(url, data=zip_path.read_bytes(), method="POST")
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Content-Type", "application/zip")
    with urllib.request.urlopen(request, timeout=300) as response:
        response.read()
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload a Polyverse site zip artifact directly to GCS.")
    parser.add_argument("--zip", required=True, help="Path to the zip artifact.")
    parser.add_argument(
        "--bucket",
        default=os.getenv("POLYVERSE_ARTIFACT_GCS_BUCKET") or os.getenv("GCS_BUCKET") or DEFAULT_BUCKET,
        help="Target GCS bucket.",
    )
    parser.add_argument(
        "--object",
        default=os.getenv("POLYVERSE_ARTIFACT_GCS_OBJECT"),
        help="Target GCS object key. Defaults to uploads/<uuid>/<zip filename>.",
    )
    parser.add_argument(
        "--credentials",
        default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or DEFAULT_CREDENTIALS_PATH,
        help="Service account JSON path.",
    )
    parser.add_argument(
        "--bearer-token",
        default=os.getenv("POLYVERSE_ARTIFACT_GCS_BEARER_TOKEN") or os.getenv("GCS_BEARER_TOKEN"),
        help="Short-lived OAuth bearer token for direct JSON API upload.",
    )
    parser.add_argument(
        "--project",
        default=os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT"),
        help="Google Cloud project id.",
    )
    parser.add_argument(
        "--no-install-deps",
        action="store_true",
        help="Do not auto-install google-cloud-storage if missing.",
    )
    parser.add_argument(
        "--no-gcloud",
        action="store_true",
        help="Skip gcloud even if it is installed.",
    )
    args = parser.parse_args()

    zip_path = Path(args.zip)
    if not zip_path.is_file():
        raise SystemExit(f"zip artifact not found: {zip_path}")

    object_name = args.object or default_object_name(zip_path)
    if upload_with_bearer_token(
        zip_path=zip_path,
        bucket=args.bucket,
        object_name=object_name,
        bearer_token=args.bearer_token or "",
    ):
        payload = {
            "bucket": args.bucket,
            "object": object_name,
            "gcs_uri": f"gs://{args.bucket}/{object_name}",
            "size_bytes": zip_path.stat().st_size,
            "content_type": "application/zip",
            "method": "bearer_token",
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    credentials_path = Path(args.credentials)
    if not credentials_path.is_file():
        raise SystemExit(f"GCS credentials not found: {credentials_path}")

    if not args.no_gcloud and upload_with_gcloud(
        zip_path=zip_path,
        bucket=args.bucket,
        object_name=object_name,
        credentials_path=credentials_path,
        project=args.project,
    ):
        payload = {
            "bucket": args.bucket,
            "object": object_name,
            "gcs_uri": f"gs://{args.bucket}/{object_name}",
            "size_bytes": zip_path.stat().st_size,
            "content_type": "application/zip",
            "method": "gcloud",
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    storage, service_account = import_storage(install_deps=not args.no_install_deps)
    credentials = service_account.Credentials.from_service_account_file(credentials_path.as_posix())
    project = args.project or getattr(credentials, "project_id", None)
    client = storage.Client(project=project, credentials=credentials)
    bucket = client.bucket(args.bucket)
    blob = bucket.blob(object_name)
    blob.cache_control = "no-store"
    blob.upload_from_filename(zip_path.as_posix(), content_type="application/zip")

    payload = {
        "bucket": args.bucket,
        "object": object_name,
        "gcs_uri": f"gs://{args.bucket}/{object_name}",
        "size_bytes": zip_path.stat().st_size,
        "content_type": "application/zip",
        "method": "python",
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
