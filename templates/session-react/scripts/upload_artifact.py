#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path


def encode_form(fields: dict[str, str], file_field: str, file_path: Path) -> tuple[bytes, str]:
    boundary = "----polyverse-artifact-" + uuid.uuid4().hex
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(str(value).encode())
        chunks.append(b"\r\n")

    filename = file_path.name
    content_type = mimetypes.guess_type(filename)[0] or "application/zip"
    chunks.append(f"--{boundary}\r\n".encode())
    chunks.append(
        (
            f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode()
    )
    chunks.append(file_path.read_bytes())
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload a built Polyverse static site zip artifact.")
    parser.add_argument("--zip", required=True, help="Path to the zip artifact.")
    parser.add_argument("--upload-url", required=True, help="One-time backend artifact upload URL.")
    parser.add_argument("--token", required=True, help="One-time upload token.")
    parser.add_argument("--entrypoint", default="index.html", help="Entrypoint HTML path inside the zip.")
    args = parser.parse_args()

    zip_path = Path(args.zip)
    if not zip_path.is_file():
        raise SystemExit(f"zip artifact not found: {zip_path}")

    body, content_type = encode_form({"entrypoint": args.entrypoint}, "artifact", zip_path)
    request = urllib.request.Request(args.upload_url, data=body, method="POST")
    request.add_header("Authorization", f"Bearer {args.token}")
    request.add_header("Content-Type", content_type)
    request.add_header("Accept", "application/json")

    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"artifact upload failed: HTTP {exc.code}: {detail}") from exc

    print(json.dumps(payload, indent=2, sort_keys=True))
    entrypoint_url = payload.get("entrypoint_url") or payload.get("preview_url")
    if entrypoint_url:
        print(f"entrypoint_url={entrypoint_url}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
