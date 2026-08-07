import time
import datetime as dt
import json
import csv
import os
import queue
import threading
from tkinter import *
from tkinter import ttk

import gspread
from google.oauth2.service_account import Credentials


class Timer:
    def __init__(self, root, race_name="test", user_email="your_email@gmail.com"):
        self.root = root
        self.race = race_name
        self.user_email = user_email
        self.date = str(dt.date.today())

        # Absolute path to this script's folder, so launches work regardless of
        # the current working directory (credentials.json sits next to timer.py).
        self.timing_dir = os.path.dirname(os.path.abspath(__file__))
        self.credentials_file = os.path.join(self.timing_dir, "credentials.json")

        # Per-race output directory at the Sommet level (sibling to Race_Web)
        race_web_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sommet_dir = os.path.dirname(race_web_dir)
        self.output_dir = os.path.join(sommet_dir, self.race)
        os.makedirs(self.output_dir, exist_ok=True)

        # File Naming Standards
        self.csv_file = os.path.join(self.output_dir, f"{self.race}.csv")
        self.state_file = os.path.join(self.output_dir, f"{self.race}_state.json")

        # Window Setup
        self.root.title(f"Race Timer - {self.race.capitalize()}")
        self.root.geometry("680x420")

        # Core State Variables
        self.startTime = 0.0
        self.place = 1
        self.is_running = False
        self.finishers = []

        # Thread-safe queue for Google Sheets batch syncing
        self.sync_queue = queue.Queue()
        self.sheet = None

        # Build UI Structure
        self.setup_ui()

        # Initialize CSV Header local file
        self.init_csv_file()

        # Initialize Google Sheets connection directly in background
        if os.path.exists(self.credentials_file):
            threading.Thread(target=self.init_google_sheet, daemon=True).start()
        else:
            self.status_label.config(text="Status: Missing credentials.json")

        # Start Background Queue Worker Thread
        threading.Thread(target=self.cloud_sync_worker, daemon=True).start()

        # Attempt crash recovery on startup
        self.load_state()

    # --- UI SETUP ---

    def setup_ui(self):
        """Creates side-by-side layout for timer controls and finisher results list."""
        main_frame = ttk.Frame(self.root, padding=15)
        main_frame.pack(fill=BOTH, expand=True)

        # --- LEFT PANE: Controls & Large Timer ---
        left_pane = ttk.Frame(main_frame, padding=10)
        left_pane.pack(side=LEFT, fill=BOTH, expand=True)

        # Race Title
        title_label = ttk.Label(left_pane, text=f"Race: {self.race}", font=("Helvetica", 14, "bold"))
        title_label.pack(anchor="w", pady=(0, 5))

        # Large High-Precision Display
        self.timer_label = ttk.Label(left_pane, text="00:00:00.00", font=("Consolas", 36, "bold"))
        self.timer_label.pack(pady=20)

        # Action Buttons
        btn_frame = ttk.Frame(left_pane)
        btn_frame.pack(pady=5)

        self.start_btn = ttk.Button(btn_frame, text="Start Race", command=self.start_time)
        self.start_btn.grid(column=0, row=0, padx=5, pady=5)

        self.finish_btn = ttk.Button(btn_frame, text="Finisher (SPACE)", command=self.finish_time, state="disabled")
        self.finish_btn.grid(column=1, row=0, padx=5, pady=5)

        self.quit_btn = ttk.Button(btn_frame, text="Quit", command=self.quit_app)
        self.quit_btn.grid(column=0, row=1, columnspan=2, sticky="ew", padx=5, pady=5)

        # Cloud Sync Status
        self.status_label = ttk.Label(left_pane, text="Status: Connecting...", font=("Helvetica", 9, "italic"))
        self.status_label.pack(anchor="w", pady=(10, 0))

        # Spacebar key binding
        self.root.bind("<space>", self.finish_time)

        # --- RIGHT PANE: Live Results Table ---
        right_pane = ttk.Frame(main_frame, padding=10)
        right_pane.pack(side=RIGHT, fill=BOTH, expand=True)

        ttk.Label(right_pane, text="Live Finishers", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(0, 5))

        columns = ("place", "bib", "time")
        self.tree = ttk.Treeview(right_pane, columns=columns, show="headings", height=12)
        self.tree.heading("place", text="Place")
        self.tree.heading("bib", text="Bib #")
        self.tree.heading("time", text="Finish Time")

        self.tree.column("place", width=50, anchor="center")
        self.tree.column("bib", width=60, anchor="center")
        self.tree.column("time", width=120, anchor="center")

        scrollbar = ttk.Scrollbar(right_pane, orient=VERTICAL, command=self.tree.yview)
        self.tree.configure(yscroll=scrollbar.set)

        self.tree.pack(side=LEFT, fill=BOTH, expand=True)
        scrollbar.pack(side=RIGHT, fill=Y)

    # --- FORMATTING & LOCAL FILES ---

    def format_elapsed_time(self, elapsed_seconds):
        """Formats floating-point seconds to HH:MM:SS.ss."""
        hours = int(elapsed_seconds // 3600)
        minutes = int((elapsed_seconds % 3600) // 60)
        seconds = elapsed_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:05.2f}"

    def init_csv_file(self):
        """Initializes standardized local CSV file if it does not exist."""
        if not os.path.exists(self.csv_file):
            with open(self.csv_file, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["Place", "Bib #", "Finish Time"])

    def append_to_csv(self, place, bib, finish_time):
        """Appends a single record to local CSV log."""
        with open(self.csv_file, "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([place, bib, finish_time])

    # --- GOOGLE SHEETS CLOUD INTEGRATION ---

    def init_google_sheet(self):
        """Connects to Google API and creates/opens a worksheet tab named {race} - {date}."""
        try:
            scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
            creds = Credentials.from_service_account_file(self.credentials_file, scopes=scopes)
            client = gspread.authorize(creds)

            # PASTE YOUR GOOGLE SHEET URL HERE
            sheet_url = "https://docs.google.com/spreadsheets/d/1IwSzpPHobzAeeagfZS7gSP9Q1bdnKD4oehv2hSczs4k/edit"
            sh = client.open_by_url(sheet_url)

            tab_name = f"{self.race} - {self.date}"

            # Check if tab already exists; if not, create a new one
            try:
                self.sheet = sh.worksheet(tab_name)
            except gspread.exceptions.WorksheetNotFound:
                self.sheet = sh.add_worksheet(title=tab_name, rows=500, cols=3)

            # Set header row if blank using table_range="A1"
            if not self.sheet.get_all_values():
                self.sheet.append_row(["Place", "Bib #", "Finish Time"], value_input_option="USER_ENTERED", table_range="A1")

            self.root.after(0, lambda: self.status_label.config(text=f"Status: Connected ({tab_name})"))
            print(f"Connected to tab: '{tab_name}'")

        except Exception as e:
            err_msg = f"Cloud Error: {e}"
            self.root.after(0, lambda: self.status_label.config(text="Status: Local Only (Cloud Error)"))
            print(err_msg)

    def cloud_sync_worker(self):
        """Background thread worker that flushes queued results to Google Sheets in batches."""
        while True:
            time.sleep(5)  # Sync batch interval every 5 seconds
            if self.sheet and not self.sync_queue.empty():
                batch = []
                while not self.sync_queue.empty():
                    batch.append(self.sync_queue.get())

                try:
                    # table_range="A1" FORCES Google Sheets to start at Column A for every batch
                    self.sheet.append_rows(batch, value_input_option="USER_ENTERED", table_range="A1")
                    print(f"Synced {len(batch)} rows to Google Sheets.")
                except Exception as e:
                    print(f"Failed to sync batch to Google Sheets: {e}")
                    # Re-queue items if network request failed
                    for row in batch:
                        self.sync_queue.put(row)

    # --- PERSISTENCE & RECOVERY ---

    def save_state(self):
        """Persists current recovery state to JSON file."""
        state_data = {
            "race": self.race,
            "date": self.date,
            "startTime": self.startTime,
            "place": self.place,
            "is_running": self.is_running,
            "finishers": self.finishers
        }
        with open(self.state_file, "w") as f:
            json.dump(state_data, f, indent=4)

    def load_state(self):
        """Loads previous state from disk following a restart or crash."""
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r") as f:
                    data = json.load(f)

                self.startTime = data.get("startTime", 0.0)
                self.place = data.get("place", 1)
                self.is_running = data.get("is_running", False)
                self.finishers = data.get("finishers", [])

                # Re-populate side list
                for record in self.finishers:
                    self.tree.insert("", "end", values=(record["place"], record["bib"], record["time"]))

                # Resume timing if active
                if self.is_running:
                    self.start_btn.config(state="disabled")
                    self.finish_btn.config(state="normal")
                    self.update_timer()

            except Exception as e:
                print(f"Error loading recovery state: {e}")

    # --- UI & RACE LOGIC ---

    def start_time(self):
        """Starts race clock with float precision."""
        self.startTime = time.time()
        self.is_running = True

        self.start_btn.config(state="disabled")
        self.finish_btn.config(state="normal")

        self.save_state()
        self.update_timer()

    def update_timer(self):
        """50ms refresh loop for smooth hundredths update."""
        if self.is_running:
            elapsed = time.time() - self.startTime
            self.timer_label.config(text=self.format_elapsed_time(elapsed))
            self.root.after(50, self.update_timer)

    def finish_time(self, event=None):
        """Triggered via Spacebar press or manual click."""
        if not self.is_running:
            return

        elapsed_seconds = time.time() - self.startTime
        finish_str = self.format_elapsed_time(elapsed_seconds)

        # 1. Local Memory Record
        record = {"place": self.place, "bib": "", "time": finish_str}
        self.finishers.append(record)

        # 2. Local CSV Append
        self.append_to_csv(self.place, "", finish_str)

        # 3. Local UI Treeview Insert
        self.tree.insert("", "end", values=(self.place, "", finish_str))
        self.tree.yview_moveto(1)

        # 4. Queue for Background Google Sheets Sync
        self.sync_queue.put([self.place, "", f"'{finish_str}"])

        self.place += 1
        self.save_state()

    def quit_app(self):
        """Safely saves state and closes the window."""
        self.save_state()
        self.root.destroy()


# --- PROGRAM LAUNCH ---
if __name__ == "__main__":
    root = Tk()
    app = Timer(root, race_name="press-expedition-50", user_email="evanehodson@gmail.com")
    root.mainloop()