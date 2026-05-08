"""
Admin license generator — run directly: python license_generator.py <HW_ID> [year]
"""
import sys
import datetime
import license_manager

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python license_generator.py <HW_ID> [year]")
        sys.exit(1)
    hw_id = sys.argv[1].strip().upper()
    year  = int(sys.argv[2]) if len(sys.argv) > 2 else datetime.date.today().year
    key   = license_manager.generate_key(hw_id, year)
    print(f"\nLicense Key for HW: {hw_id}")
    print(f"Year   : {year}")
    print(f"Key    : {key}\n")
