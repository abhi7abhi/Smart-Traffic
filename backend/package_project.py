"""
package_project.py — Creates a clean smart-traffic-system.zip distribution
"""
import os
import zipfile
import shutil

SOURCE_DIR = r"C:\Users\abhin\.gemini\antigravity\scratch\smart-traffic-system"
ARTIFACT_ZIP = r"C:\Users\abhin\.gemini\antigravity\brain\26f16ec7-838e-4d83-a12f-7ff8d861d1bf\smart-traffic-system.zip"
DOWNLOAD_ZIP = r"C:\Users\abhin\Downloads\smart-traffic-system.zip"

EXCLUDE_DIRS = {"node_modules", ".git", ".vercel", "__pycache__"}
EXCLUDE_EXTS = {".pyc"}

def make_zip(out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(SOURCE_DIR):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in files:
                if any(file.endswith(ext) for ext in EXCLUDE_EXTS):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, SOURCE_DIR)
                zipf.write(full_path, rel_path)

if __name__ == "__main__":
    print("Packaging artifact zip...")
    make_zip(ARTIFACT_ZIP)
    print(f"Artifact zip created: {os.path.getsize(ARTIFACT_ZIP):,} bytes")
    shutil.copy2(ARTIFACT_ZIP, DOWNLOAD_ZIP)
    print(f"Downloads zip created: {os.path.getsize(DOWNLOAD_ZIP):,} bytes")
