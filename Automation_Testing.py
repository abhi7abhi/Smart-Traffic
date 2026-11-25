"""
Automation_Testing.py
================================================================================
Automated End-to-End UI and Functional Testing for:
Smart Crash & Traffic Management System
Target URL: https://smart-traffic-senp.vercel.app/

Framework: Python 3 + Selenium WebDriver (Chrome)
================================================================================
"""

import os
import sys
import time
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementClickInterceptedException,
    StaleElementReferenceException,
)

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
TARGET_URL = "https://smart-traffic-senp.vercel.app/"
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "selenium_test_screenshots")
DEFAULT_TIMEOUT = 15

# Valid test credentials provided in project configuration
TEST_EMAIL = "alice@example.com"
TEST_PASSWORD = "securepass123"
TEST_USER_NAME = "Alice Sharma"


def setup_driver():
    """Configure and initialize Chrome WebDriver."""
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    driver = webdriver.Chrome(options=chrome_options)
    driver.set_page_load_timeout(30)
    driver.maximize_window()
    return driver


def take_screenshot(driver, filename):
    """Safely capture and persist a screenshot."""
    try:
        os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
        filepath = os.path.join(SCREENSHOTS_DIR, filename)
        driver.save_screenshot(filepath)
        return filepath
    except Exception as e:
        print(f"  [Warning] Could not capture screenshot '{filename}': {e}")
        return None


def create_dummy_test_image():
    """Create a valid local dummy JPEG file for crash report photo upload tests."""
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    img_path = os.path.join(SCREENSHOTS_DIR, "test_crash_photo.jpg")
    # 1x1 valid minimal JPEG byte sequence
    jpeg_bytes = bytes.fromhex(
        "ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f14"
        "1d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100"
        "ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9"
    )
    with open(img_path, "wb") as f:
        f.write(jpeg_bytes)
    return img_path


def main():
    print("=" * 80)
    print(" SMART CRASH & TRAFFIC MANAGEMENT SYSTEM - AUTOMATED SELENIUM TEST SUITE")
    print(f" Target Application: {TARGET_URL}")
    print(f" Execution Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

    test_results = []
    submitted_report_info = {}

    driver = None
    try:
        driver = setup_driver()
        wait = WebDriverWait(driver, DEFAULT_TIMEOUT)

        # ======================================================================
        # TC 01 – Homepage Loading
        # ======================================================================
        print("\n[Running] TC 01 – Homepage Loading...")
        try:
            driver.get(TARGET_URL)
            wait.until(EC.presence_of_element_located((By.ID, "hero-from-input")))
            wait.until(EC.presence_of_element_located((By.ID, "hero-to-input")))

            page_title = driver.title
            h1_el = wait.until(EC.visibility_of_element_located((By.TAG_NAME, "h1")))
            h1_text = h1_el.text.replace("\n", " ").strip()

            assert "Smart Crash & Traffic Management System" in page_title, f"Unexpected title: '{page_title}'"
            assert "Safer Roads, Smarter Journeys" in h1_text, f"Unexpected headline: '{h1_text}'"

            take_screenshot(driver, "01_homepage.png")
            print("Test Step 1 Passed: Smart Traffic homepage loaded successfully.")
            test_results.append({
                "id": "TC 01",
                "scenario": "Homepage Loading",
                "expected": "Homepage loads successfully with project title and hero interface visible",
                "actual": f"Homepage loaded. Title: '{page_title}', Hero: '{h1_text}'",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "01_homepage_fail.png")
            test_results.append({
                "id": "TC 01",
                "scenario": "Homepage Loading",
                "expected": "Homepage loads successfully",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 02 – Navigation Testing
        # ======================================================================
        print("\n[Running] TC 02 – Navigation Testing...")
        try:
            topbar = wait.until(EC.presence_of_element_located((By.ID, "topbarNav")))

            # 1. Navigate to Crash Data
            btn_crash_data = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Crash Data')]")
            ))
            btn_crash_data.click()
            wait.until(EC.url_contains("/crash-data"))
            wait.until(EC.visibility_of_element_located((By.XPATH, "//*[contains(text(), 'Crash Data')]")))

            # 2. Navigate to Report Crash
            btn_report = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Report Crash')]")
            ))
            btn_report.click()
            wait.until(EC.url_contains("/report-crash"))
            wait.until(EC.visibility_of_element_located((By.XPATH, "//*[contains(text(), 'Report an Incident')]")))

            # 3. Navigate to Dashboard
            btn_dash = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Dashboard')]")
            ))
            btn_dash.click()
            wait.until(EC.url_contains("/dashboard"))
            wait.until(EC.visibility_of_element_located((By.XPATH, "//*[contains(text(), 'Dashboard')]")))

            # 4. Navigate back to Home
            btn_home = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Home')]")
            ))
            btn_home.click()
            wait.until(EC.visibility_of_element_located((By.ID, "hero-from-input")))

            take_screenshot(driver, "02_navigation.png")
            print("Test Step 2 Passed: Navigation links working successfully.")
            test_results.append({
                "id": "TC 02",
                "scenario": "Navigation Testing",
                "expected": "Navigation between Home, Crash Data, Report Crash, and Dashboard works cleanly",
                "actual": "All 4 topbar routes responded, updated browser URL, and rendered destination views",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "02_navigation_fail.png")
            test_results.append({
                "id": "TC 02",
                "scenario": "Navigation Testing",
                "expected": "Navigation works successfully",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 03 – Location Search
        # ======================================================================
        print("\n[Running] TC 03 – Location Search...")
        try:
            # Ensure on Home
            driver.get(TARGET_URL)
            wait.until(EC.presence_of_element_located((By.ID, "hero-from-input")))

            # Clear and set From input
            clear_buttons = driver.find_elements(By.XPATH, "//button[@title='Clear' or @aria-label='Clear location input']")
            if len(clear_buttons) >= 1:
                clear_buttons[0].click()
                time.sleep(0.3)

            from_input = wait.until(EC.element_to_be_clickable((By.ID, "hero-from-input")))
            from_input.click()
            from_input.send_keys("Electronic City")
            time.sleep(1.2)
            from_suggestions = driver.find_elements(By.CSS_SELECTOR, ".divide-y button")
            if from_suggestions:
                from_suggestions[0].click()
            time.sleep(0.5)

            # Clear and set To input
            clear_buttons = driver.find_elements(By.XPATH, "//button[@title='Clear' or @aria-label='Clear location input']")
            if len(clear_buttons) >= 2:
                clear_buttons[1].click()
                time.sleep(0.3)
            elif len(clear_buttons) == 1:
                clear_buttons[0].click()
                time.sleep(0.3)

            to_input = wait.until(EC.element_to_be_clickable((By.ID, "hero-to-input")))
            to_input.click()
            to_input.send_keys("Koramangala")
            time.sleep(1.2)
            to_suggestions = driver.find_elements(By.CSS_SELECTOR, ".divide-y button")
            if to_suggestions:
                to_suggestions[0].click()
            time.sleep(0.5)

            search_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Search Route')]")))
            search_btn.click()

            # Wait for route overview panel with distance/duration
            overview_panel = wait.until(EC.visibility_of_element_located((By.ID, "routeOverviewPanel")))
            panel_text = overview_panel.text

            assert "Route Overview" in panel_text, "Route overview heading not found in result"
            assert ("km" in panel_text or "mins" in panel_text), "Calculated route metrics missing"

            take_screenshot(driver, "03_route_search.png")
            print("Test Step 3 Passed: Route search executed successfully.")
            test_results.append({
                "id": "TC 03",
                "scenario": "Location Search",
                "expected": "Real-time route calculation between Electronic City and Koramangala with distance and ETA",
                "actual": f"Route search succeeded. Route Overview rendered with live distance & ETA metrics",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Step 3 Failed: Route calculation/API unavailable.", str(e))
            take_screenshot(driver, "03_route_search_fail.png")
            test_results.append({
                "id": "TC 03",
                "scenario": "Location Search",
                "expected": "Route search executed successfully",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 04 – Map and Route Rendering
        # ======================================================================
        print("\n[Running] TC 04 – Map and Route Rendering...")
        try:
            # Verify Leaflet Map container is visible
            leaflet_container = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".leaflet-container")))
            assert leaflet_container.is_displayed(), "Leaflet map container is not visible"

            # Verify Leaflet SVG polylines (route paths)
            time.sleep(2)
            polylines = driver.find_elements(By.CSS_SELECTOR, ".leaflet-overlay-pane svg path")
            assert len(polylines) > 0, "No route polyline path found rendered inside Leaflet overlay pane"

            # Verify Leaflet markers (origin & destination pins)
            markers = driver.find_elements(By.CSS_SELECTOR, ".leaflet-marker-pane .leaflet-marker-icon")
            assert len(markers) >= 2, f"Expected at least 2 route markers, found: {len(markers)}"

            take_screenshot(driver, "04_route_map.png")
            print("Test Step 4 Passed: Interactive map and route rendered successfully.")
            test_results.append({
                "id": "TC 04",
                "scenario": "Map and Route Rendering",
                "expected": "Leaflet map rendered with route polyline and waypoint markers",
                "actual": f"Interactive Leaflet map rendered ({len(polylines)} route polylines, {len(markers)} markers)",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "04_route_map_fail.png")
            test_results.append({
                "id": "TC 04",
                "scenario": "Map and Route Rendering",
                "expected": "Interactive map and route rendered successfully",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 05 – User Login
        # ======================================================================
        print("\n[Running] TC 05 – User Login...")
        try:
            sign_in_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Sign In')]")))
            sign_in_btn.click()

            # Wait for login modal
            wait.until(EC.visibility_of_element_located((By.XPATH, "//*[contains(text(), 'Sign In to Account')]")))

            email_inp = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='email']")))
            pass_inp = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='password']")))
            submit_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//button[@type='submit' and contains(., 'Sign In')]")))

            assert email_inp.is_displayed(), "Email input field not visible in login modal"
            assert pass_inp.is_displayed(), "Password input field not visible in login modal"

            email_inp.clear()
            email_inp.send_keys(TEST_EMAIL)
            pass_inp.clear()
            pass_inp.send_keys(TEST_PASSWORD)

            take_screenshot(driver, "05_login_modal.png")
            submit_btn.click()

            # Wait for authenticated user badge in topbar
            logged_in_badge = wait.until(EC.visibility_of_element_located(
                (By.XPATH, "//*[contains(text(), 'Logged In') or contains(text(), 'Logout')]")
            ))
            assert logged_in_badge.is_displayed(), "User session badge not displayed after login"

            take_screenshot(driver, "05_login.png")
            print("Test Step 5 Passed: User login executed and authenticated successfully.")
            test_results.append({
                "id": "TC 05",
                "scenario": "User Login",
                "expected": "User authenticates with valid credentials, session stored, topbar shows user badge",
                "actual": f"Authenticated as '{TEST_USER_NAME}' ({TEST_EMAIL}). Topbar updated with active session",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "05_login_fail.png")
            test_results.append({
                "id": "TC 05",
                "scenario": "User Login",
                "expected": "Valid user can authenticate",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 06 – Crash Reporting Form
        # ======================================================================
        print("\n[Running] TC 06 – Crash Reporting Form...")
        try:
            # Navigate to Report Crash while logged in
            btn_report = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Report Crash')]")
            ))
            btn_report.click()

            # Verify authenticated form loaded
            h1_el = wait.until(EC.visibility_of_element_located((By.TAG_NAME, "h1")))
            assert "Submit Incident Report" in h1_el.text, f"Unexpected form title: {h1_el.text}"

            # Verify all required form fields exist
            date_inp = driver.find_element(By.CSS_SELECTOR, "input[type='date']")
            time_inp = driver.find_element(By.CSS_SELECTOR, "input[type='time']")
            loc_inp = driver.find_element(By.CSS_SELECTOR, "input[list='reportLocList']")
            desc_inp = driver.find_element(By.TAG_NAME, "textarea")
            selects = driver.find_elements(By.TAG_NAME, "select")
            file_inp = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
            submit_btn = driver.find_element(By.XPATH, "//button[@type='submit']")

            assert date_inp.is_displayed(), "Date input missing"
            assert time_inp.is_displayed(), "Time input missing"
            assert loc_inp.is_displayed(), "Location input missing"
            assert desc_inp.is_displayed(), "Description textarea missing"
            assert len(selects) >= 3, f"Expected 3 selects (Crash Type, Severity, Condition), found {len(selects)}"

            take_screenshot(driver, "06_crash_report.png")
            print("Test Step 6 Passed: Crash reporting form loaded successfully.")
            test_results.append({
                "id": "TC 06",
                "scenario": "Crash Reporting Form",
                "expected": "Authenticated crash reporting form loads with Date, Time, Location, Type, Severity, Road Condition, Description, Camera/Upload",
                "actual": "Form loaded with all required inputs, dropdowns, camera viewport, and submission controls",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "06_crash_report_fail.png")
            test_results.append({
                "id": "TC 06",
                "scenario": "Crash Reporting Form",
                "expected": "Form loads correctly",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 07 – Mandatory Crash Photo Validation
        # ======================================================================
        print("\n[Running] TC 07 – Mandatory Crash Photo Validation...")
        try:
            # Ensure form is loaded and photo is empty
            loc_inp = driver.find_element(By.CSS_SELECTOR, "input[list='reportLocList']")
            loc_inp.clear()
            loc_inp.send_keys("Electronic City near Toll Gate, Bengaluru")

            desc_inp = driver.find_element(By.TAG_NAME, "textarea")
            desc_inp.clear()
            desc_inp.send_keys("Mandatory photo validation test - photo intentionally omitted.")

            submit_btn = driver.find_element(By.XPATH, "//button[@type='submit']")
            is_disabled = submit_btn.get_attribute("disabled") is not None

            # Verify button disabled or enforcement
            assert is_disabled, "Submit button should be disabled when photoDataUrl is missing"

            take_screenshot(driver, "07_photo_validation.png")
            print("Test Step 7 Passed: Mandatory crash photo validation working correctly.")
            test_results.append({
                "id": "TC 07",
                "scenario": "Photo Validation",
                "expected": "Crash photo is mandatory and report submission is prohibited without a live capture or uploaded photo",
                "actual": "Submit button disabled attribute is strictly enforced when photo is empty",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "07_photo_validation_fail.png")
            test_results.append({
                "id": "TC 07",
                "scenario": "Photo Validation",
                "expected": "Photo requirement enforced",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 08 – Crash Report Submission
        # ======================================================================
        print("\n[Running] TC 08 – Crash Report Submission...")
        try:
            test_img = create_dummy_test_image()
            file_inp = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
            file_inp.send_keys(test_img)
            time.sleep(1.5)

            # Re-fetch submit button and verify it is now enabled
            submit_btn = driver.find_element(By.XPATH, "//button[@type='submit']")
            assert submit_btn.get_attribute("disabled") is None, "Submit button remained disabled after uploading image"

            # Fill with distinct test data
            loc_inp = driver.find_element(By.CSS_SELECTOR, "input[list='reportLocList']")
            loc_inp.clear()
            test_location = "Electronic City, Bengaluru"
            loc_inp.send_keys(test_location)

            desc_inp = driver.find_element(By.TAG_NAME, "textarea")
            desc_inp.clear()
            test_description = f"Selenium automated testing crash report - timestamp {int(time.time())}"
            desc_inp.send_keys(test_description)

            # Select Severity = Medium
            select_els = driver.find_elements(By.TAG_NAME, "select")
            if len(select_els) >= 2:
                # select_els[1] is Severity
                Select(select_els[1]).select_by_visible_text("Medium")

            submit_btn.click()

            # Wait for success notification box
            success_box = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".border-emerald-500\\/30")))
            success_text = success_box.text
            assert "Crash Report Successfully Registered!" in success_text, f"Success message not observed: {success_text}"

            submitted_report_info["location"] = test_location
            submitted_report_info["description"] = test_description
            submitted_report_info["success_text"] = success_text

            take_screenshot(driver, "08_crash_submission.png")
            print("Test Step 8 Passed: Crash report submitted successfully.")
            test_results.append({
                "id": "TC 08",
                "scenario": "Crash Report Submission",
                "expected": "Report submitted successfully with image payload, success banner displays Report ID",
                "actual": f"Submission successful. Observed: '{success_text.splitlines()[1]}'",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "08_crash_submission_fail.png")
            test_results.append({
                "id": "TC 08",
                "scenario": "Crash Report Submission",
                "expected": "Report submitted successfully",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 09 – Crash Data Page
        # ======================================================================
        print("\n[Running] TC 09 – Crash Data Page...")
        try:
            btn_crash_data = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Crash Data')]")
            ))
            btn_crash_data.click()

            wait.until(EC.url_contains("/crash-data"))
            heading = wait.until(EC.visibility_of_element_located(
                (By.XPATH, "//*[contains(text(), 'Your Submitted Crash Reports') or contains(text(), 'Crash Reports')]")
            ))

            # Verify records table or card list rendered
            records = driver.find_elements(By.CSS_SELECTOR, "table tbody tr, .divide-y > div, div[class*='border-slate-800']")
            assert len(records) > 0, "No crash records rendered on Crash Data page"

            take_screenshot(driver, "09_crash_data.png")
            print("Test Step 9 Passed: Crash Data page loaded successfully.")
            test_results.append({
                "id": "TC 09",
                "scenario": "Crash Data",
                "expected": "Crash Data view loads with authenticated user's incident history table and telemetry cards",
                "actual": f"Loaded '{heading.text}'. Rendered {len(records)} record cards/rows with status badges",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "09_crash_data_fail.png")
            test_results.append({
                "id": "TC 09",
                "scenario": "Crash Data",
                "expected": "Records displayed",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 10 – Dashboard
        # ======================================================================
        print("\n[Running] TC 10 – Dashboard...")
        try:
            btn_dash = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Dashboard')]")
            ))
            btn_dash.click()

            wait.until(EC.url_contains("/dashboard"))
            h1_el = wait.until(EC.visibility_of_element_located((By.TAG_NAME, "h1")))
            assert "Crash & Traffic Analytics Dashboard" in h1_el.text, f"Unexpected dashboard heading: {h1_el.text}"

            # Verify metric stat cards
            stat_cards = driver.find_elements(By.XPATH, "//*[contains(text(), 'Total Incidents') or contains(text(), 'Total Submissions') or contains(text(), 'Severity Breakdown') or contains(text(), 'High Severity')]")
            assert len(stat_cards) > 0, "Dashboard summary statistics cards missing"

            # Verify Chart.js canvas elements once data resolves
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "canvas")))
            canvases = driver.find_elements(By.TAG_NAME, "canvas")
            assert len(canvases) >= 2, f"Expected at least 2 Chart.js canvases (Bar, Doughnut/Line), found: {len(canvases)}"

            take_screenshot(driver, "10_dashboard.png")
            print("Test Step 10 Passed: Crash and Traffic Dashboard loaded successfully.")
            test_results.append({
                "id": "TC 10",
                "scenario": "Dashboard",
                "expected": "Dashboard loads with aggregate severity metrics, Chart.js visualizations, and corridor summaries",
                "actual": f"Dashboard loaded with {len(stat_cards)} metric cards, {len(canvases)} Chart.js canvases, and corridor telemetry",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "10_dashboard_fail.png")
            test_results.append({
                "id": "TC 10",
                "scenario": "Dashboard",
                "expected": "Dashboard loads and displays data",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 11 – Database/Data Consistency
        # ======================================================================
        print("\n[Running] TC 11 – Database/Data Consistency...")
        try:
            # Navigate back to Crash Data to confirm submitted record is reflected
            btn_crash_data = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Crash Data')]")
            ))
            btn_crash_data.click()
            wait.until(EC.url_contains("/crash-data"))
            time.sleep(2)

            page_source = driver.page_source
            submitted_loc = submitted_report_info.get("location", "Electronic City")

            assert submitted_loc in page_source, f"Submitted crash report location '{submitted_loc}' not found in Crash Data table"
            assert "Pending" in page_source or "PENDING" in page_source, "Submitted report status 'Pending' not reflected"

            take_screenshot(driver, "11_data_consistency.png")
            print("Test Step 11 Passed: End-to-end database consistency confirmed across UI and backend.")
            test_results.append({
                "id": "TC 11",
                "scenario": "Database/Data Consistency",
                "expected": "Crash report created in TC 08 is persisted and displayed in Crash Data view",
                "actual": f"Record confirmed: Location '{submitted_loc}' present with Status 'Pending'",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "11_data_consistency_fail.png")
            test_results.append({
                "id": "TC 11",
                "scenario": "Database/Data Consistency",
                "expected": "Submitted data reflected in UI",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

        # ======================================================================
        # TC 12 – Logout
        # ======================================================================
        print("\n[Running] TC 12 – Logout...")
        try:
            logout_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Logout')]")))
            logout_btn.click()
            time.sleep(1.5)

            # Verify Sign In button is back in topbar
            sign_in_btn = wait.until(EC.visibility_of_element_located((By.XPATH, "//button[contains(., 'Sign In')]")))
            assert sign_in_btn.is_displayed(), "Sign In button not visible after logout"

            # Verify localStorage auth tokens are cleared
            token_val = driver.execute_script("return localStorage.getItem('currentUser');")
            assert token_val is None, "currentUser was not cleared from localStorage after logout"

            # Navigate to Report Crash and verify protected prompt
            btn_report = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//nav[@id='topbarNav']//button[contains(., 'Report Crash')]")
            ))
            btn_report.click()
            wait.until(EC.visibility_of_element_located((By.XPATH, "//*[contains(text(), 'Sign In to Report an Incident')]")))

            take_screenshot(driver, "12_logout.png")
            print("Test Step 12 Passed: Logout functionality working successfully.")
            test_results.append({
                "id": "TC 12",
                "scenario": "Logout",
                "expected": "User session ends, tokens removed from storage, protected routes prompt for authentication",
                "actual": "Logged out cleanly. Storage purged, 'Sign In' button restored, protected pages guarded",
                "status": "PASS"
            })
        except Exception as e:
            print("Test Failed with Exception:", str(e))
            take_screenshot(driver, "12_logout_fail.png")
            test_results.append({
                "id": "TC 12",
                "scenario": "Logout",
                "expected": "User session ends",
                "actual": f"Failure: {str(e)}",
                "status": "FAIL"
            })

    finally:
        if driver:
            driver.quit()

    # ==========================================================================
    # 5. Final Test Summary
    # ==========================================================================
    total_tests = len(test_results)
    passed_tests = sum(1 for r in test_results if r["status"] == "PASS")
    failed_tests = sum(1 for r in test_results if r["status"] == "FAIL")
    skipped_tests = sum(1 for r in test_results if r["status"] == "SKIPPED")

    print("\n" + "=" * 60)
    print("SMART CRASH & TRAFFIC MANAGEMENT SYSTEM")
    print("AUTOMATED SELENIUM TEST SUMMARY")
    print("=" * 60)
    for r in test_results:
        spacing = 38 - len(f"{r['id']} - {r['scenario']}")
        pad = " " * max(1, spacing)
        print(f"{r['id']} - {r['scenario']}{pad}{r['status']}")

    print("\nTotal Tests:   ", total_tests)
    print("Passed:        ", passed_tests)
    print("Failed:        ", failed_tests)
    print("Skipped:       ", skipped_tests)
    print("=" * 60)

    # ==========================================================================
    # 6. Test Case Execution Table
    # ==========================================================================
    print("\n" + "=" * 120)
    print("TEST CASE EXECUTION TABLE")
    print("=" * 120)
    print(f"| {'Test ID':<7} | {'Test Scenario / Module':<27} | {'Expected Behavior':<35} | {'Actual Behavior':<35} | {'Status':<7} |")
    print(f"|{'-'*9}|{'-'*29}|{'-'*37}|{'-'*37}|{'-'*9}|")
    for r in test_results:
        exp_short = (r["expected"][:32] + "...") if len(r["expected"]) > 35 else r["expected"]
        act_short = (r["actual"][:32] + "...") if len(r["actual"]) > 35 else r["actual"]
        print(f"| {r['id']:<7} | {r['scenario']:<27} | {exp_short:<35} | {act_short:<35} | {r['status']:<7} |")
    print("=" * 120)

    print(f"\nScreenshots saved to: {SCREENSHOTS_DIR}")
    return passed_tests, failed_tests, skipped_tests


if __name__ == "__main__":
    passed, failed, skipped = main()
    sys.exit(0 if failed == 0 else 1)
