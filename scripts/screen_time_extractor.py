#!/usr/bin/env python3
"""
macOS Screen Time Data Extractor

This script extracts daily screen time data from the macOS Screen Time database (knowledgeC.db).
It provides various options for querying and exporting the data.

Requirements:
- macOS with Screen Time enabled
- Python 3.6+
- Access to ~/Library/Application Support/Knowledge/knowledgeC.db

Usage:
    python3 screen_time_extractor.py [options]
"""

import sqlite3
import os
import sys
import argparse
import json
import csv
from datetime import datetime, timedelta
from pathlib import Path
import subprocess


class ScreenTimeExtractor:
    def __init__(self):
        self.db_path = os.path.expanduser(
            "~/Library/Application Support/Knowledge/knowledgeC.db"
        )
        self.app_name_cache = {}

    def check_database_access(self):
        """Check if the Screen Time database is accessible."""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(
                f"Screen Time database not found at: {self.db_path}"
            )

        if not os.access(self.db_path, os.R_OK):
            raise PermissionError(
                f"Cannot read Screen Time database. You may need to grant Terminal full disk access in System Preferences > Security & Privacy > Privacy > Full Disk Access"
            )

        return True

    def get_app_name_from_bundle_id(self, bundle_id):
        """Try to get the human-readable app name from bundle ID."""
        if bundle_id in self.app_name_cache:
            return self.app_name_cache[bundle_id]

        try:
            # Try to get app name using mdfind
            result = subprocess.run(
                ["mdfind", f'kMDItemCFBundleIdentifier == "{bundle_id}"'],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.stdout.strip():
                app_path = result.stdout.strip().split("\n")[0]
                app_name = os.path.basename(app_path).replace(".app", "")
                self.app_name_cache[bundle_id] = app_name
                return app_name
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass

        # Fallback: extract name from bundle ID
        if bundle_id:
            # Handle common patterns
            if "." in bundle_id:
                parts = bundle_id.split(".")
                app_name = parts[-1]  # Take the last part
                # Capitalize first letter
                app_name = app_name.capitalize()
                self.app_name_cache[bundle_id] = app_name
                return app_name

        self.app_name_cache[bundle_id] = bundle_id or "Unknown"
        return bundle_id or "Unknown"

    def query_screen_time(self, date_filter="today", limit=None):
        """
        Query screen time data from the database.

        Args:
            date_filter: "today", "yesterday", "week", or specific date (YYYY-MM-DD)
            limit: Maximum number of results to return

        Returns:
            List of dictionaries containing app usage data
        """
        self.check_database_access()

        # Build date filter condition
        if date_filter == "today":
            date_condition = "date(DATETIME(ZOBJECT.ZSTARTDATE + 978307200, 'unixepoch', 'localtime')) = date('now', 'localtime')"
        elif date_filter == "yesterday":
            date_condition = "date(DATETIME(ZOBJECT.ZSTARTDATE + 978307200, 'unixepoch', 'localtime')) = date('now', '-1 day', 'localtime')"
        elif date_filter == "week":
            date_condition = "date(DATETIME(ZOBJECT.ZSTARTDATE + 978307200, 'unixepoch', 'localtime')) >= date('now', '-7 days', 'localtime')"
        else:
            # Assume it's a specific date
            try:
                datetime.strptime(date_filter, "%Y-%m-%d")
                date_condition = f"date(DATETIME(ZOBJECT.ZSTARTDATE + 978307200, 'unixepoch', 'localtime')) = '{date_filter}'"
            except ValueError:
                raise ValueError(
                    f"Invalid date format: {date_filter}. Use YYYY-MM-DD format."
                )

        query = f"""
        SELECT
            ZOBJECT.ZVALUESTRING AS bundle_id,
            SUM(ZOBJECT.ZENDDATE - ZOBJECT.ZSTARTDATE) AS total_seconds,
            COUNT(*) AS session_count,
            MIN(DATETIME(ZOBJECT.ZSTARTDATE + 978307200, 'unixepoch', 'localtime')) AS first_use,
            MAX(DATETIME(ZOBJECT.ZENDDATE + 978307200, 'unixepoch', 'localtime')) AS last_use
        FROM ZOBJECT
        WHERE ZSTREAMNAME = '/app/usage'
          AND {date_condition}
          AND ZOBJECT.ZVALUESTRING IS NOT NULL
          AND ZOBJECT.ZVALUESTRING != ''
        GROUP BY ZOBJECT.ZVALUESTRING
        HAVING total_seconds > 0
        ORDER BY total_seconds DESC
        """

        if limit:
            query += f" LIMIT {limit}"

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(query)

            results = []
            for row in cursor.fetchall():
                bundle_id, total_seconds, session_count, first_use, last_use = row

                # Convert seconds to more readable formats
                hours = total_seconds / 3600
                minutes = total_seconds / 60

                app_name = self.get_app_name_from_bundle_id(bundle_id)

                results.append(
                    {
                        "app_name": app_name,
                        "bundle_id": bundle_id,
                        "total_seconds": int(total_seconds),
                        "total_minutes": round(minutes, 2),
                        "total_hours": round(hours, 2),
                        "session_count": session_count,
                        "first_use": first_use,
                        "last_use": last_use,
                        "formatted_duration": self.format_duration(total_seconds),
                    }
                )

            conn.close()
            return results

        except sqlite3.Error as e:
            raise RuntimeError(f"Database error: {e}")

    def format_duration(self, seconds):
        """Format duration in seconds to human-readable format."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        seconds = int(seconds % 60)

        if hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"

    def get_total_screen_time(self, results):
        """Calculate total screen time from results."""
        total_seconds = sum(app["total_seconds"] for app in results)
        return {
            "total_seconds": total_seconds,
            "total_minutes": round(total_seconds / 60, 2),
            "total_hours": round(total_seconds / 3600, 2),
            "formatted_duration": self.format_duration(total_seconds),
        }

    def export_to_csv(self, results, filename):
        """Export results to CSV file."""
        with open(filename, "w", newline="", encoding="utf-8") as csvfile:
            fieldnames = [
                "app_name",
                "bundle_id",
                "total_hours",
                "total_minutes",
                "session_count",
                "first_use",
                "last_use",
                "formatted_duration",
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

            writer.writeheader()
            for app in results:
                writer.writerow({k: v for k, v in app.items() if k in fieldnames})

    def export_to_json(self, results, filename):
        """Export results to JSON file."""
        with open(filename, "w", encoding="utf-8") as jsonfile:
            json.dump(results, jsonfile, indent=2, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(description="Extract macOS Screen Time data")
    parser.add_argument(
        "--date",
        "-d",
        default="today",
        help='Date filter: "today", "yesterday", "week", or YYYY-MM-DD (default: today)',
    )
    parser.add_argument("--limit", "-l", type=int, help="Limit number of apps to show")
    parser.add_argument(
        "--format",
        "-f",
        choices=["console", "json", "csv"],
        default="console",
        help="Output format (default: console)",
    )
    parser.add_argument(
        "--output", "-o", help="Output file name (required for json/csv formats)"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show detailed information"
    )

    args = parser.parse_args()

    try:
        extractor = ScreenTimeExtractor()
        results = extractor.query_screen_time(args.date, args.limit)

        if not results:
            print(f"No screen time data found for {args.date}")
            return

        total_stats = extractor.get_total_screen_time(results)

        if args.format == "console":
            print(f"\n📱 Screen Time Report for {args.date}")
            print("=" * 50)
            print(
                f"Total Screen Time: {total_stats['formatted_duration']} ({total_stats['total_hours']:.2f} hours)"
            )
            print(f"Number of Apps Used: {len(results)}")
            print("\nTop Apps by Usage:")
            print("-" * 50)

            for i, app in enumerate(results, 1):
                if args.verbose:
                    print(f"{i:2d}. {app['app_name']}")
                    print(
                        f"     Duration: {app['formatted_duration']} ({app['total_hours']:.2f}h)"
                    )
                    print(f"     Sessions: {app['session_count']}")
                    print(f"     Bundle ID: {app['bundle_id']}")
                    print(f"     First Use: {app['first_use']}")
                    print(f"     Last Use: {app['last_use']}")
                    print()
                else:
                    percentage = (
                        app["total_seconds"] / total_stats["total_seconds"]
                    ) * 100
                    print(
                        f"{i:2d}. {app['app_name']:<30} {app['formatted_duration']:>10} ({percentage:5.1f}%)"
                    )

        elif args.format == "json":
            if not args.output:
                args.output = f"screen_time_{args.date}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

            export_data = {
                "date": args.date,
                "generated_at": datetime.now().isoformat(),
                "total_stats": total_stats,
                "apps": results,
            }
            extractor.export_to_json(export_data, args.output)
            print(f"Screen time data exported to: {args.output}")

        elif args.format == "csv":
            if not args.output:
                args.output = f"screen_time_{args.date}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

            extractor.export_to_csv(results, args.output)
            print(f"Screen time data exported to: {args.output}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
