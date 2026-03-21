#!/usr/bin/env python3
"""Capture screenshots of CovertEDA UI for documentation."""

import time
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = "/sessions/dreamy-sharp-gauss/CovertEDA/docs/screenshots"
BASE_URL = "http://localhost:5173"

def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1400, "height": 900},
            device_scale_factor=2,
        )
        page = context.new_page()

        # 1. Start Screen
        print("Capturing Start Screen...")
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/01_start_screen.png")

        # The app uses a section-based nav. We need to click into the IDE view first.
        # Look for a way to open a project or navigate to IDE sections.
        # The app likely needs us to click something to enter the IDE.

        # Let's try clicking "New Project" or similar to get into IDE view
        # First, let's see what's on the start screen
        page.screenshot(path=f"{SCREENSHOTS_DIR}/01_start_screen.png")

        # Try to find and click elements to navigate to IDE sections
        # The IDE sections are accessed via left sidebar icons once a project is open.
        # Since we don't have a Tauri backend, we need to check if the app
        # falls back to a demo/mock mode.

        # Try to navigate directly to different sections by manipulating state
        # We'll use page.evaluate to switch sections
        sections = [
            ("build", "02_build_pipeline"),
            ("reports", "03_reports_viewer"),
            ("console", "04_console"),
            ("constraints", "05_constraint_editor"),
            ("programmer", "06_device_programmer"),
            ("history", "07_build_history"),
            ("power", "08_power_calculator"),
            ("reveal", "09_reveal_debug"),
            ("runs", "10_run_manager"),
            ("ip", "11_ip_catalog"),
            ("eco", "12_eco_editor"),
            ("simulation", "13_simulation_wizard"),
            ("templates", "14_source_templates"),
            ("git", "15_git_panel"),
            ("ssh", "16_ssh_panel"),
            ("license", "17_license_management"),
            ("docs", "18_documentation"),
            ("ai", "19_ai_assistant"),
        ]

        # Try clicking into the IDE by looking for any available button
        # Check if there's a demo project option or if we can bypass the start screen
        try:
            # Try to find a "New Project" or "Open" button
            buttons = page.query_selector_all("button")
            for btn in buttons:
                text = btn.inner_text()
                if "new" in text.lower() or "demo" in text.lower():
                    print(f"  Clicking button: {text}")
                    btn.click()
                    time.sleep(0.5)
                    break
        except Exception as e:
            print(f"  Could not click start button: {e}")

        time.sleep(1)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/01b_after_click.png")

        # Check the current state - are we in the IDE now?
        content = page.content()
        in_ide = "sec" in page.url or page.query_selector("[data-section]") is not None

        # Try to set section via localStorage or window state
        for section_id, filename in sections:
            print(f"Capturing {section_id}...")
            try:
                # Try to click the sidebar icon for this section
                # The sidebar buttons typically have data attributes or aria labels
                selector = f'[data-section="{section_id}"], [data-sec="{section_id}"], [title*="{section_id}" i], button[aria-label*="{section_id}" i]'
                btn = page.query_selector(selector)
                if btn:
                    btn.click()
                    time.sleep(0.5)
                else:
                    # Try finding by clicking sidebar icons in order
                    # Or try using evaluate to trigger section change
                    page.evaluate(f'''() => {{
                        // Try to dispatch a custom event or find React state
                        const event = new CustomEvent('navigate-section', {{ detail: '{section_id}' }});
                        window.dispatchEvent(event);
                    }}''')
                    time.sleep(0.3)

                page.screenshot(path=f"{SCREENSHOTS_DIR}/{filename}.png")
            except Exception as e:
                print(f"  Error capturing {section_id}: {e}")

        # Also try keyboard shortcuts
        print("Trying command palette...")
        try:
            page.keyboard.press("Control+Shift+p")
            time.sleep(0.5)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/20_command_palette.png")
            page.keyboard.press("Escape")
        except Exception as e:
            print(f"  Error: {e}")

        browser.close()
        print("Done!")

if __name__ == "__main__":
    take_screenshots()
