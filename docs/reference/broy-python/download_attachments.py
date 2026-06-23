"""Download all attachments from a Gmail message into a working folder.

Usage:
  python download_attachments.py <MESSAGE_ID> [OUTPUT_DIR]

Auth: reuses the workspace Gmail token (gmail.readonly).
Part of the Romans report-processing pipeline (see workflows/romans-report-processing.md).
"""
import sys
import base64
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

TOKEN = "G:/My Drive/Claude Brain/credentials/gmail_token.json"

def main():
    if len(sys.argv) < 2:
        print("usage: python download_attachments.py <MESSAGE_ID> [OUTPUT_DIR]")
        sys.exit(1)
    msg_id = sys.argv[1]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(f"G:/My Drive/Claude Brain/.tmp/gmail_{msg_id}")
    out.mkdir(parents=True, exist_ok=True)

    creds = Credentials.from_authorized_user_file(TOKEN)
    service = build("gmail", "v1", credentials=creds)
    msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()

    def walk(parts):
        for p in parts:
            fn, body = p.get("filename"), p.get("body", {})
            aid = body.get("attachmentId")
            if fn and aid:
                att = service.users().messages().attachments().get(
                    userId="me", messageId=msg_id, id=aid).execute()
                data = base64.urlsafe_b64decode(att["data"])
                (out / fn).write_bytes(data)
                print(f"{len(data):>9,}  {fn}")
            if p.get("parts"):
                walk(p["parts"])

    walk(msg["payload"].get("parts", []))
    print("DONE ->", out)

if __name__ == "__main__":
    main()
