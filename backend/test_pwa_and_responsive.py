"""
test_pwa_and_responsive.py — Automated Tests for Mobile, Responsive & PWA Assets
================================================================================
Verifies:
1. manifest.json structure, display mode, icons, and metadata.
2. sw.js service worker static shell caching and strict network-only bypass for /api/.
3. index.html responsive viewport, mobile menu toggle, flip camera button, PWA links.
4. style.css / src/index.css mobile breakpoints, touch target sizing, table scroll.
5. React / App.js dynamic host discovery (API_BASE), camera flip logic, and SW registration.
6. Flask CORS multi-device origins and allowed HTTP methods.
"""
import os
import sys
import json
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app

class TestPWAAndResponsive(unittest.TestCase):
    def test_01_manifest_json_validity(self):
        manifest_path = os.path.join(ROOT_DIR, "manifest.json")
        self.assertTrue(os.path.isfile(manifest_path), "manifest.json must exist in project root")
        with open(manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertEqual(data.get("name"), "Smart Crash & Traffic Management System")
        self.assertEqual(data.get("short_name"), "SmartTraffic")
        self.assertEqual(data.get("display"), "standalone")
        self.assertEqual(data.get("start_url"), "./index.html")
        self.assertIn("icons", data)
        self.assertGreaterEqual(len(data["icons"]), 2)

        for icon in data["icons"]:
            icon_file = os.path.join(ROOT_DIR, icon["src"])
            self.assertTrue(os.path.isfile(icon_file), f"Icon file {icon['src']} must exist on disk")

    def test_02_service_worker_security_and_caching(self):
        sw_path = os.path.join(ROOT_DIR, "sw.js")
        self.assertTrue(os.path.isfile(sw_path), "sw.js must exist in project root")
        with open(sw_path, "r", encoding="utf-8") as f:
            sw_text = f.read()

        # Must have install, activate, and fetch listeners
        self.assertIn("install", sw_text)
        self.assertIn("activate", sw_text)
        self.assertIn("fetch", sw_text)

        # STRICT SECURITY CHECK: Never cache /api/ endpoints to prevent cross-account data leaks!
        self.assertIn("/api/", sw_text)
        self.assertTrue(
            'startsWith("/api/")' in sw_text or 'startsWith(\'/api/\')' in sw_text,
            "Service worker must explicitly bypass cache for /api/ routes"
        )

    def test_03_index_html_responsive_and_mobile_elements(self):
        html_path = os.path.join(ROOT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        # Viewport meta tag
        self.assertIn("viewport", html)
        self.assertIn("width=device-width", html)

        # PWA & iOS meta tags
        self.assertIn("manifest.json", html)
        self.assertIn("apple-mobile-web-app-capable", html)
        self.assertIn("theme-color", html)

        # Mobile Hamburger Menu Toggle & Backdrop
        self.assertIn("btnMobileMenuToggle", html)
        self.assertIn("mobileNavBackdrop", html)

        # Flip Camera Button
        self.assertIn("btnFlipCamera", html)

        # All tables wrapped in table-responsive
        self.assertIn("table-responsive", html)

    def test_04_style_css_mobile_rules(self):
        legacy_css = os.path.join(ROOT_DIR, "style.css")
        if os.path.isfile(legacy_css):
            with open(legacy_css, "r", encoding="utf-8") as f:
                css = f.read()
            self.assertIn(".btn-mobile-menu-toggle", css)
            self.assertIn(".hamburger-bar", css)
            self.assertIn(".mobile-nav-backdrop", css)
            self.assertIn(".topbar-nav.mobile-open", css)
            self.assertIn(".btn-flip-camera", css)
            self.assertIn("-webkit-overflow-scrolling: touch", css)
            self.assertIn("@media (max-width: 768px)", css)
            self.assertIn("@media (max-width: 480px)", css)
        else:
            # Verified pure React + Tailwind CSS utility architecture
            navbar_jsx = os.path.join(ROOT_DIR, "src", "components", "Navbar.jsx")
            report_jsx = os.path.join(ROOT_DIR, "src", "components", "ReportCrashView.jsx")
            dashboard_jsx = os.path.join(ROOT_DIR, "src", "components", "DashboardView.jsx")
            self.assertTrue(os.path.isfile(navbar_jsx), "Navbar.jsx must exist")
            self.assertTrue(os.path.isfile(report_jsx), "ReportCrashView.jsx must exist")
            self.assertTrue(os.path.isfile(dashboard_jsx), "DashboardView.jsx must exist")
            with open(navbar_jsx, "r", encoding="utf-8") as f:
                nav = f.read()
            with open(report_jsx, "r", encoding="utf-8") as f:
                rep = f.read()
            with open(dashboard_jsx, "r", encoding="utf-8") as f:
                dash = f.read()

            # Mobile hamburger and drawer classes
            self.assertIn("btn-mobile-menu-toggle", nav)
            self.assertIn("hamburger-bar", nav)
            self.assertIn("mobile-nav-backdrop", nav)
            self.assertIn("mobile-open", nav)
            self.assertIn("touch-action:manipulation", nav)

            # Flip camera button and touch target
            self.assertIn("btn-flip-camera", rep)
            self.assertIn("touch-action:manipulation", rep)

            # Touch-friendly scrolling
            self.assertIn("-webkit-overflow-scrolling:touch", dash)

    def test_05_app_js_dynamic_host_and_mobile_logic(self):
        legacy_js = os.path.join(ROOT_DIR, "app.js")
        if os.path.isfile(legacy_js):
            with open(legacy_js, "r", encoding="utf-8") as f:
                js = f.read()
        else:
            # Check React SPA source files
            files_to_check = [
                os.path.join(ROOT_DIR, "src", "services", "api.js"),
                os.path.join(ROOT_DIR, "src", "components", "Navbar.jsx"),
                os.path.join(ROOT_DIR, "src", "components", "ReportCrashView.jsx"),
                os.path.join(ROOT_DIR, "src", "App.jsx")
            ]
            js = ""
            for p in files_to_check:
                if os.path.isfile(p):
                    with open(p, "r", encoding="utf-8") as f:
                        js += f.read() + "\n"

        # Dynamic API_BASE resolution
        self.assertIn("window.location.hostname", js)
        self.assertIn("5000", js)

        # Flip camera logic
        self.assertTrue("flipInAppCamera" in js or "flipCamera" in js)
        self.assertTrue("_cameraFacingMode" in js or "facingMode" in js)

        # Mobile navigation logic
        self.assertIn("btnMobileMenuToggle", js)
        self.assertIn("mobile-open", js)

        # Service Worker registration
        self.assertIn("serviceWorker", js)
        self.assertIn("sw.js", js)

    def test_06_backend_cors_and_methods(self):
        client = app.app.test_client()
        # Test preflight OPTIONS request
        res = client.options("/api/crash-statistics", headers={
            "Origin": "http://192.168.1.75:3000",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "Authorization, Content-Type"
        })
        self.assertEqual(res.status_code, 200)
        self.assertIn("Access-Control-Allow-Origin", res.headers)
        self.assertIn(res.headers["Access-Control-Allow-Origin"], ["*", "http://192.168.1.75:3000"])

if __name__ == "__main__":
    unittest.main()
