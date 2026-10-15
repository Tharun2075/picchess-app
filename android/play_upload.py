#!/usr/bin/env python3
"""Upload PicChess to Google Play (internal track, draft) via the Play Developer API.

Usage:
  python3 play_upload.py --dry-run          # edits.insert only, print the response, delete the edit
  python3 play_upload.py --aab PicChess-1.aab  # full flow: bundle, internal draft, listing, images, validate, commit

The access token comes from ~/.workflow/bin/play-token. The app must already exist
in Play Console (Create app + first AAB uploaded by hand); the API cannot create apps.
Standard library only.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

PKG = "ai.thatched.picchess"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/"
HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(HERE, "store")
LANG = "en-GB"
SCREENSHOTS = ["01-scan.png", "02-engine.png", "03-editor.png", "04-home.png", "05-hints-pgn.png"]


def token():
    return subprocess.check_output([os.path.expanduser("~/.workflow/bin/play-token")], text=True).strip()


def call(method, url, tok, body=None, data=None, ctype="application/json"):
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + tok)
    if data is not None:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def must(step, res):
    status, body = res
    print(f"{step}: HTTP {status}")
    if status >= 300:
        print(json.dumps(body, indent=2) if not isinstance(body, str) else body)
        sys.exit(1)
    return body


def read(name):
    with open(os.path.join(STORE, name), encoding="utf-8") as f:
        return f.read().strip()


def upload_image(tok, edit, kind, name):
    with open(os.path.join(STORE, name), "rb") as f:
        data = f.read()
    url = f"{UPLOAD}{PKG}/edits/{edit}/listings/{LANG}/{kind}?uploadType=media"
    must(f"images.upload {kind} {name}", call("POST", url, tok, data=data, ctype="image/png"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--aab", default=os.path.expanduser("~/Downloads/PicChess-1.aab"))
    ap.add_argument("--no-commit", action="store_true", help="validate but do not commit")
    a = ap.parse_args()
    tok = token()

    status, body = call("POST", f"{API}{PKG}/edits", tok, body={})
    print(f"edits.insert: HTTP {status}")
    print(json.dumps(body, indent=2) if not isinstance(body, str) else body)
    if status >= 300:
        sys.exit(1)
    edit = body["id"]
    if a.dry_run:
        call("DELETE", f"{API}{PKG}/edits/{edit}", tok)
        print("dry run: edit deleted, nothing committed")
        return

    with open(a.aab, "rb") as f:
        aab = f.read()
    bundle = must("bundles.upload", call(
        "POST", f"{UPLOAD}{PKG}/edits/{edit}/bundles?uploadType=media", tok,
        data=aab, ctype="application/octet-stream"))
    vc = bundle["versionCode"]

    must("tracks.update internal", call(
        "PUT", f"{API}{PKG}/edits/{edit}/tracks/internal", tok,
        body={"track": "internal", "releases": [
            {"name": f"{vc}", "versionCodes": [str(vc)], "status": "draft"}]}))

    must("listings.update", call(
        "PUT", f"{API}{PKG}/edits/{edit}/listings/{LANG}", tok,
        body={"language": LANG, "title": "PicChess",
              "shortDescription": read("short-description.txt"),
              "fullDescription": read("full-description.txt")}))

    for kind in ("icon", "featureGraphic", "phoneScreenshots"):
        must(f"images.deleteall {kind}", call(
            "DELETE", f"{API}{PKG}/edits/{edit}/listings/{LANG}/{kind}", tok))
    upload_image(tok, edit, "icon", "icon-512.png")
    upload_image(tok, edit, "featureGraphic", "feature-graphic.png")
    for s in SCREENSHOTS:
        upload_image(tok, edit, "phoneScreenshots", s)

    must("edits.validate", call("POST", f"{API}{PKG}/edits/{edit}:validate", tok))
    if a.no_commit:
        print("validated; not committed (--no-commit)")
        return
    print(json.dumps(must("edits.commit", call("POST", f"{API}{PKG}/edits/{edit}:commit", tok)), indent=2))


if __name__ == "__main__":
    main()
