from flask import Flask, request, jsonify, render_template, send_from_directory
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Font, Alignment
from datetime import datetime
from zoneinfo import ZoneInfo
import json
import os
from threading import Lock

from datetime import datetime

app = Flask(__name__)
# -------------------------------------------------
# WRITE DATA ONLY
#
# B = Product
# C = Cash
# D = Card
# E = GPay
#
# NO HEADERS
# -------------------------------------------------

# Product


TXT_FILE = "daily_revenue.txt"
BASE_DIR = app.root_path
EXCEL_FOLDER = os.path.join(BASE_DIR, "ex")
BILLS_FILE = os.path.join(BASE_DIR, "bills.xlsx")
DAILY_REVENUE_FILE = os.path.join(BASE_DIR, "daily_revenue.txt")
EXPENSES_FILE = "expenses.txt"
BILL_TAX_RATE = 0
BILL_HEADERS = [
    "Product",
    "Cash",
    "Card",
    "GPay"
]

# ---------------------------------------------------------------
# Where the bill table starts inside bills.xlsx, and which column
# each field is saved in.
#
# BILL_START_ROW / BILL_START_COL shift the whole table (1 = row 1 /
# column A).
#
# BILL_WRITE_HEADERS controls whether label text ("Product", "Price",
# "Payment Method", ...) is written at all. Set to False if you only
# want the raw values saved, with nothing else in the sheet — in that
# case data starts writing directly at BILL_START_ROW instead of the
# row below it.
#
# BILL_FIELD_COLUMNS places each individual field relative to
# BILL_START_COL: 1 = the start column itself, 2 = one column to its
# right, 3 = two columns right, and so on. Edit these to reorder
# fields, or use bigger gaps between numbers to leave empty columns
# between fields (e.g. Price = 3 instead of 2 leaves column B blank).
# Every field must still point to a DIFFERENT number.
# ---------------------------------------------------------------
BILL_START_ROW = 7968
BILL_START_COL = 2
BILL_WRITE_HEADERS = False

BILL_FIELD_COLUMNS = {
    "Product": 1,
    "Cash": 2,
    "Card": 3,
    "GPay": 4,
}


def bill_col(field):
    """The actual worksheet column number for a given bill field."""
    return BILL_START_COL - 1 + BILL_FIELD_COLUMNS[field]


# The row bill data itself starts on: the row right after the header
# row when headers are written, or BILL_START_ROW itself when they're
# not.
def bill_data_start_row():
    return BILL_START_ROW + 1 if BILL_WRITE_HEADERS else BILL_START_ROW

BILLS_LOCK = Lock()
REVENUE_TIMEZONE = ZoneInfo("Asia/Kolkata")

os.makedirs(EXCEL_FOLDER, exist_ok=True)


def calculate_bill_totals(products):
    """
    Calculate bill totals on the server so the saved Excel data is reliable.

    This function is also importable by other Python modules:
        from main import calculate_bill_totals
    """
    normalized_products = []

    for product in products or []:
        try:
            price = float(product.get("price", 0) or 0)
        except (TypeError, ValueError):
            price = 0.0

        try:
            quantity = int(float(product.get("quantity", 0) or 0))
        except (TypeError, ValueError):
            quantity = 0

        price = max(price, 0.0)
        quantity = max(quantity, 0)
        product_total = round(price * quantity, 2)

        normalized_products.append({
            "name": str(product.get("name", "")).strip(),
            "price": price,
            "quantity": quantity,
            "total": product_total
        })

    subtotal = round(
        sum(product["total"] for product in normalized_products),
        2
    )
    total_quantity = sum(
        product["quantity"] for product in normalized_products
    )
    tax = round(subtotal * BILL_TAX_RATE, 2)
    total = round(subtotal + tax, 2)

    return {
        "products": normalized_products,
        "totalQuantity": total_quantity,
        "subtotal": subtotal,
        "taxRate": BILL_TAX_RATE,
        "tax": tax,
        "total": total
    }


def append_daily_revenue(bill, total, timestamp=None):
    """
    Append one successful bill to daily_revenue.txt.

    The file uses one JSON object per line, so it remains a normal readable
    text file while still being safe to parse for daily summaries.
    """
    timestamp = timestamp or datetime.now(REVENUE_TIMEZONE)
    revenue_entry = {
        "date": timestamp.strftime("%Y-%m-%d"),
        "time": timestamp.strftime("%H:%M:%S"),
        "customer": bill.get("customerLabel", ""),
        "paymentMethod": bill.get("paymentMethod", ""),
        "total": round(float(total), 2)
    }

    with open(
        DAILY_REVENUE_FILE,
        "a",
        encoding="utf-8"
    ) as revenue_file:
        revenue_file.write(
            json.dumps(revenue_entry, ensure_ascii=False) + "\n"
        )

    return revenue_entry


def read_daily_revenue():
    """Read and group the text revenue log by day."""
    days = {}

    if not os.path.isfile(DAILY_REVENUE_FILE):
        return []

    with open(
        DAILY_REVENUE_FILE,
        "r",
        encoding="utf-8"
    ) as revenue_file:
        for line in revenue_file:
            try:
                entry = json.loads(line)
                date_value = str(entry.get("date", "")).strip()
                total_value = round(float(entry.get("total", 0) or 0), 2)
            except (TypeError, ValueError, json.JSONDecodeError):
                continue

            if not date_value:
                continue

            if date_value not in days:
                days[date_value] = {
                    "date": date_value,
                    "totalRevenue": 0.0,
                    "billCount": 0,
                    "entries": []
                }

            days[date_value]["totalRevenue"] = round(
                days[date_value]["totalRevenue"] + total_value,
                2
            )
            days[date_value]["billCount"] += 1
            days[date_value]["entries"].append({
                "time": entry.get("time", ""),
                "customer": entry.get("customer", ""),
                "paymentMethod": entry.get("paymentMethod", ""),
                "total": total_value
            })

    return sorted(
        days.values(),
        key=lambda day: day["date"],
        reverse=True
    )


def find_total_column(header_values):
    """Find the bill-total column while tolerating common header variations."""
    normalized_headers = [
        "".join(
            character.lower()
            for character in str(header or "")
            if character.isalnum()
        )
        for header in header_values
    ]

    exact_names = {
        "total",
        "totalamount",
        "grandtotal",
        "billtotal",
        "totalrevenue",
    }

    for index, header in enumerate(normalized_headers):
        if header in exact_names:
            return index

    for index, header in enumerate(normalized_headers):
        if "total" in header and "product" not in header:
            return index

    return None


def normalize_payment_method(payment_method):
    """Keep payment totals consistent even when labels vary slightly."""
    value = str(payment_method or "").strip().lower()
    compact_value = "".join(
        character for character in value if character.isalnum()
    )

    if compact_value in {"gpay", "googlepay", "upi"}:
        return "GPay"
    if compact_value in {"cash"}:
        return "Cash"
    if compact_value in {"card", "creditcard", "debitcard"}:
        return "Card"
    return "Other"


def read_payment_revenue(requested_date=""):
    """Return revenue grouped by payment method, optionally for one day."""
    payment_totals = {
        "GPay": 0.0,
        "Cash": 0.0,
        "Card": 0.0,
        "Other": 0.0
    }
    payment_counts = {
        "GPay": 0,
        "Cash": 0,
        "Card": 0,
        "Other": 0
    }

    if not os.path.isfile(DAILY_REVENUE_FILE):
        return payment_totals, payment_counts

    with open(
        DAILY_REVENUE_FILE,
        "r",
        encoding="utf-8"
    ) as revenue_file:
        for line in revenue_file:
            try:
                entry = json.loads(line)
                entry_date = str(entry.get("date", "")).strip()
                total = round(float(entry.get("total", 0) or 0), 2)
            except (TypeError, ValueError, json.JSONDecodeError):
                continue

            if requested_date and entry_date != requested_date:
                continue

            payment_method = normalize_payment_method(
                entry.get("paymentMethod", "")
            )
            payment_totals[payment_method] = round(
                payment_totals[payment_method] + total,
                2
            )
            payment_counts[payment_method] += 1

    return payment_totals, payment_counts


@app.route("/login")
def home():
    return render_template("home.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")
@app.route("/")
def index():
    return render_template("home.html")


@app.route("/membership")
def membership():
    return render_template("membership.html")


@app.route("/bill")
def bill():
    return render_template("bill.html")

@app.route("/expense")
def expen():
    return render_template("expen.html")
@app.route("/save-expense", methods=["POST"])
def save_expense():
    data = request.get_json(silent=True) or {}
 
    name = (data.get("name") or "").strip()
    amount = data.get("amount")
    reason = (data.get("reason") or "").strip()
    company_purchase = bool(data.get("company_purchase"))
 
    if not name or not reason or amount in (None, ""):
        return jsonify({"error": "Missing name, amount, or reason"}), 400
 
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "Amount must be a number"}), 400
 
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    purchase_type = "Company Purchase" if company_purchase else "Personal"
 
    line = f"{timestamp} | {name} | ₹{amount:.2f} | {purchase_type} | {reason}\n"
 
    with open(EXPENSES_FILE, "a", encoding="utf-8") as f:
        f.write(line)
 
    return jsonify({"status": "saved"}), 200

@app.route("/save-bill", methods=["POST"])
def save_bill():

    bill = request.get_json(silent=True) or {}

    if not bill:
        return jsonify({
            "error": "No bill data received"
        }), 400

    products = bill.get("products", [])

    if (
        not isinstance(products, list)
        or not products
        or not all(isinstance(product, dict) for product in products)
    ):
        return jsonify({
            "error": "At least one valid product is required"
        }), 400

    # ---------------------------------------------------------
    # CALCULATE BILL
    #
    # These values are used internally by Flask.
    # They are NOT saved into Excel except for the product
    # amount in the appropriate payment column.
    # ---------------------------------------------------------

    totals = calculate_bill_totals(products)

    payment_method = str(
        bill.get("paymentMethod", "")
    ).strip()

    payment_method_normalized = normalize_payment_method(
        payment_method
    )

    # Only allow Cash, Card or GPay
    if payment_method_normalized not in [
        "Cash",
        "Card",
        "GPay"
    ]:
        return jsonify({
            "error": "Invalid payment method. Use Cash, Card or GPay."
        }), 400

    workbook = None

    try:

        # -----------------------------------------------------
        # PREVENT TWO BILLS FROM WRITING AT THE SAME TIME
        # -----------------------------------------------------

        with BILLS_LOCK:

            # -------------------------------------------------
            # OPEN EXISTING EXCEL OR CREATE NEW ONE
            # -------------------------------------------------

            if os.path.exists(BILLS_FILE):

                workbook = load_workbook(
                    BILLS_FILE
                )

                sheet = workbook.active

            else:

                workbook = Workbook()

                sheet = workbook.active

            # -------------------------------------------------
            # REMOVE MERGED CELLS
            #
            # Prevents:
            # 'MergedCell' object attribute 'value' is read-only
            # -------------------------------------------------

            merged_ranges = list(
                sheet.merged_cells.ranges
            )

            for merged_range in merged_ranges:

                sheet.unmerge_cells(
                    str(merged_range)
                )

            # -------------------------------------------------
            # IMPORTANT:
            #
            # NO HEADERS ARE CREATED.
            #
            # A = unused
            # B = Product
            # C = Cash
            # D = Card
            # E = GPay
            # -------------------------------------------------

            # -------------------------------------------------
            # FIND NEXT EMPTY ROW
            #
            # We check COLUMN B because Product is always
            # written there.
            # -------------------------------------------------

            # Bills start from row 7968
            next_row = 7968
            while next_row <= 1048576:

                existing_product = sheet.cell(
                    row=next_row,
                    column=2
                    ).value

                if existing_product in (None, ""):
                    break
                next_row += 1

            # Excel maximum row protection
            if next_row > 1048576:

                return jsonify({
                    "error": "bills.xlsx is full"
                }), 500

            # -------------------------------------------------
            # COLORS
            #
            # RGB values converted to Excel ARGB format.
            # FF = full opacity.
            # -------------------------------------------------

            PRODUCT_COLOR = "FF66CCFF"
            CASH_COLOR = "FF00CC66"
            CARD_COLOR = "FFFFFF99"
            GPAY_COLOR = "FFFF6687"

            # -------------------------------------------------
            # SAVE EACH PRODUCT
            # -------------------------------------------------

            for product in totals["products"]:

                if next_row > 1048576:

                    return jsonify({
                        "error": "Not enough rows in bills.xlsx"
                    }), 500

                product_name = product["name"]
                product_total = product["total"]

                # -------------------------------------------------
                # DEFAULT PAYMENT VALUES
                # -------------------------------------------------

                cash = 0
                card = 0
                gpay = 0

                # -------------------------------------------------
                # PUT PRODUCT TOTAL INTO CORRECT PAYMENT COLUMN
                # -------------------------------------------------

                if payment_method_normalized == "Cash":

                    cash = product_total

                elif payment_method_normalized == "Card":

                    card = product_total

                elif payment_method_normalized == "GPay":

                    gpay = product_total

                # =================================================
                # B = PRODUCT
                # =================================================

                product_cell = sheet.cell(
                    row=next_row,
                    column=2,
                    value=product_name
                )

                product_cell.font = Font(
                    name="Arial",
                    size=16,
                    color=PRODUCT_COLOR
                )

                # =================================================
                # C = CASH
                # =================================================

                cash_cell = sheet.cell(
                    row=next_row,
                    column=3,
                    value=cash
                )

                cash_cell.font = Font(
                    name="Arial",
                    size=16,
                    color=CASH_COLOR
                )

                # =================================================
                # D = CARD
                # =================================================

                card_cell = sheet.cell(
                    row=next_row,
                    column=4,
                    value=card
                )

                card_cell.font = Font(
                    name="Arial",
                    size=16,
                    color=CARD_COLOR
                )

                # =================================================
                # E = GPAY
                # =================================================

                gpay_cell = sheet.cell(
                    row=next_row,
                    column=5,
                    value=gpay
                )

                gpay_cell.font = Font(
                    name="Arial",
                    size=16,
                    color=GPAY_COLOR
                )

                # -------------------------------------------------
                # ALIGNMENT
                # -------------------------------------------------

                product_cell.alignment = Alignment(
                    horizontal="left",
                    vertical="center"
                )

                cash_cell.alignment = Alignment(
                    horizontal="center",
                    vertical="center"
                )

                card_cell.alignment = Alignment(
                    horizontal="center",
                    vertical="center"
                )

                gpay_cell.alignment = Alignment(
                    horizontal="center",
                    vertical="center"
                )

                # -------------------------------------------------
                # ROW HEIGHT
                # -------------------------------------------------

                sheet.row_dimensions[
                    next_row
                ].height = 25

                # Next product
                next_row += 1

            # -----------------------------------------------------
            # COLUMN WIDTHS
            # -----------------------------------------------------

            sheet.column_dimensions["B"].width = 30
            sheet.column_dimensions["C"].width = 15
            sheet.column_dimensions["D"].width = 15
            sheet.column_dimensions["E"].width = 15

            # -----------------------------------------------------
            # SAVE EXCEL
            # -----------------------------------------------------

            workbook.save(
                BILLS_FILE
            )

            # -----------------------------------------------------
            # DAILY REVENUE
            #
            # This goes into daily_revenue.txt.
            # It does NOT go into Excel.
            # -----------------------------------------------------

            revenue_entry = append_daily_revenue(
                bill,
                totals["total"]
            )

        # ---------------------------------------------------------
        # SUCCESS RESPONSE
        # ---------------------------------------------------------

        return jsonify({
            "message": "Bill saved successfully",
            "filename": "bills.xlsx",
            "total": totals["total"],
            "totalQuantity": totals["totalQuantity"],
            "revenueDate": revenue_entry["date"],
            "revenueTime": revenue_entry["time"]
        }), 200

    # -------------------------------------------------------------
    # ERROR
    # -------------------------------------------------------------

    except Exception as e:

        print(
            "Error saving bill:",
            repr(e)
        )

        return jsonify({
            "error": str(e)
        }), 500

    # -------------------------------------------------------------
    # CLOSE WORKBOOK
    # -------------------------------------------------------------

    finally:

        if workbook is not None:

            workbook.close()

@app.route("/daily-revenue", methods=["GET"])
def daily_revenue():
    days = read_daily_revenue()
    requested_date = request.args.get("date", "").strip()

    selected_day = None
    if requested_date:
        selected_day = next(
            (
                day for day in days
                if day["date"] == requested_date
            ),
            None
        )

    all_time_total_revenue = round(
        sum(day["totalRevenue"] for day in days),
        2
    )
    all_time_bill_count = sum(day["billCount"] for day in days)

    if requested_date:
        total_revenue = (
            selected_day["totalRevenue"]
            if selected_day
            else 0.0
        )
        bill_count = (
            selected_day["billCount"]
            if selected_day
            else 0
        )
    else:
        total_revenue = all_time_total_revenue
        bill_count = all_time_bill_count

    return jsonify({
        "filename": "daily_revenue.txt",
        "days": days,
        "selectedDate": requested_date or None,
        "selectedDay": selected_day,
        "totalRevenue": total_revenue,
        "billCount": bill_count,
        "allTimeTotalRevenue": all_time_total_revenue,
        "allTimeBillCount": all_time_bill_count
    })


@app.route("/payment-revenue", methods=["GET"])
def payment_revenue():
    requested_date = request.args.get("date", "").strip()
    payment_totals, payment_counts = read_payment_revenue(
        requested_date
    )

    return jsonify({
        "filename": "daily_revenue.txt",
        "selectedDate": requested_date or None,
        "paymentTotals": payment_totals,
        "paymentCounts": payment_counts,
        "totalRevenue": round(sum(payment_totals.values()), 2),
        "billCount": sum(payment_counts.values())
    })

@app.route("/api/payments")
def payments():
    try:
        with open(TXT_FILE, "r", encoding="utf-8") as file:
            lines = file.readlines()

        return jsonify({
            "lines": [line.strip() for line in lines if line.strip()]
        })

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500
    
@app.route("/bill-revenue", methods=["GET"])
def bill_revenue():
    """
    Return revenue from bills.xlsx for dashboards and other JS files.

    New bills store the subtotal, tax, and total only on the first product
    row. The createdAt grouping also prevents older files, which repeated
    totals on every product row, from being counted more than once.
    """
    if not os.path.isfile(BILLS_FILE):
        return jsonify({
            "totalRevenue": 0,
            "billCount": 0,
            "filename": "bills.xlsx"
        })

    workbook = None

    try:
        workbook = load_workbook(
            BILLS_FILE,
            data_only=True,
            read_only=True
        )
        sheet = workbook.active
        header_values = [
            sheet.cell(
                row=BILL_START_ROW,
                column=bill_col(field)
            ).value
            for field in BILL_HEADERS
        ]

        total_index = find_total_column(header_values)
        if total_index is None:
            return jsonify({
                "error": (
                    "A total column was not found in bills.xlsx. "
                    f"Found headers: {header_values}"
                )
            }), 500

        try:
            created_at_index = header_values.index("Created At")
        except ValueError:
            created_at_index = None

        seen_bills = set()
        total_revenue = 0.0
        bill_count = 0

        for row_number in range(BILL_START_ROW + 1, sheet.max_row + 1):
            row = [
                sheet.cell(
                    row=row_number,
                    column=bill_col(field)
                ).value
                for field in BILL_HEADERS
            ]

            total_value = (
                row[total_index]
                if total_index < len(row)
                else None
            )

            if total_value in (None, ""):
                continue

            if created_at_index is not None:
                created_at = (
                    row[created_at_index]
                    if created_at_index < len(row)
                    else ""
                )
                bill_key = str(created_at).strip()
            else:
                bill_key = ""

            # For old files, all product rows for one bill share Created At.
            # For a missing timestamp, count the row itself.
            if bill_key:
                if bill_key in seen_bills:
                    continue
                seen_bills.add(bill_key)

            try:
                total_revenue += float(total_value)
            except (TypeError, ValueError):
                continue

            bill_count += 1

        return jsonify({
            "totalRevenue": round(total_revenue, 2),
            "billCount": bill_count,
            "filename": "bills.xlsx"
        })

    except Exception as e:
        print("Error reading bill revenue:", repr(e))
        return jsonify({
            "error": str(e)
        }), 500
    finally:
        if workbook is not None:
            workbook.close()


@app.route("/search-member/<membership_no>")
def search_member(membership_no):

    membership_no = str(
        membership_no
    ).strip()

    filename = f"{membership_no}.xlsx"

    file_path = os.path.join(
        EXCEL_FOLDER,
        filename
    )

    if not os.path.isfile(file_path):

        return jsonify({
            "error": "Membership file not found"
        }), 404

    try:

        workbook = load_workbook(
            file_path,
            data_only=True
        )

        sheet = workbook.active

        entries = []

        for row in sheet.iter_rows(
            values_only=True
        ):

            values = list(row)

            if not any(
                value is not None and
                str(value).strip() != ""
                for value in values
            ):
                continue

            first_value = ""

            if (
                len(values) > 0 and
                values[0] is not None
            ):
                first_value = str(
                    values[0]
                ).strip().lower()

            if first_value in [
                "s.no",
                "sno",
                "date"
            ]:
                continue

            sno = (
                values[0]
                if len(values) > 0
                else ""
            )

            date_value = (
                values[1]
                if len(values) > 1
                else ""
            )

            write_value = (
                values[2]
                if len(values) > 2
                else ""
            )

            recharged_value = (
                values[3]
                if len(values) > 3
                else ""
            )

            balance_value = (
                values[4]
                if len(values) > 4
                else ""
            )

            if date_value is None:
                date_value = ""

            if write_value is None:
                write_value = ""

            if recharged_value is None:
                recharged_value = ""

            if balance_value is None:
                balance_value = ""

            if hasattr(
                date_value,
                "strftime"
            ):
                date_value = date_value.strftime(
                    "%Y-%m-%d"
                )

            entries.append({
                "sno": sno,
                "date": str(date_value),
                "write": str(write_value),
                "recharged": recharged_value,
                "balance": balance_value
            })

        workbook.close()

        return jsonify(entries)

    except Exception as e:

        print(
            "ERROR READING MEMBERSHIP:",
            repr(e)
        )

        return jsonify({
            "error": str(e)
        }), 500


@app.route("/save-member", methods=["POST"])
def save_member():

    data = request.get_json()

    if not data:

        return jsonify({
            "error": "No membership data received"
        }), 400

    membership_no = str(
        data.get("membershipNo", "")
    ).strip()

    if not membership_no:

        return jsonify({
            "error": "Membership number is required"
        }), 400

    filename = f"{membership_no}.xlsx"

    file_path = os.path.join(
        EXCEL_FOLDER,
        filename
    )

    print()
    print("========================================")
    print("MEMBERSHIP SAVE")
    print("Membership:", membership_no)
    print("File:", file_path)

    if not os.path.isfile(file_path):

        print("Membership file does NOT exist")
        print("========================================")

        return jsonify({
            "error": f"{filename} does not exist"
        }), 404

    try:

        workbook = load_workbook(file_path)

        sheet = workbook.active

        if sheet.max_row == 1:

            first_row = [
                cell.value
                for cell in sheet[1]
            ]

            if all(
                value is None
                for value in first_row
            ):

                sheet.delete_rows(1)

                sheet.append([
                    "Date",
                    "Write",
                    "Recharged",
                    "Balance"
                ])

        elif sheet.max_row == 0:

            sheet.append([
                "Date",
                "Write",
                "Recharged",
                "Balance"
            ])

        date_value = data.get(
            "date",
            ""
        )

        write_value = data.get(
            "write",
            ""
        )

        recharged_value = data.get(
            "recharged",
            ""
        )

        balance_value = data.get(
            "balance",
            ""
        )

        sheet.append([
            date_value,
            write_value,
            recharged_value,
            balance_value
        ])

        workbook.save(file_path)
        workbook.close()

        print("Saved successfully")
        print("Date:", date_value)
        print("Write:", write_value)
        print("Recharged:", recharged_value)
        print("Balance:", balance_value)
        print("========================================")
        print()

        return jsonify({
            "message": "Membership purchase saved",
            "filename": filename
        })

    except Exception as e:

        print(
            "ERROR SAVING MEMBERSHIP:",
            repr(e)
        )

        return jsonify({
            "error": str(e)
        }), 500

@app.route("/update-member", methods=["POST"])
def update_member():

    data = request.get_json()

    if not data:
        return jsonify({
            "error": "No data received"
        }), 400

    membership_no = str(
        data.get("membershipNo", "")
    ).strip()

    entries = data.get("entries", [])

    if not membership_no:
        return jsonify({
            "error": "Membership number is required"
        }), 400

    if not isinstance(entries, list):
        return jsonify({
            "error": "Invalid entries"
        }), 400

    filename = f"{membership_no}.xlsx"

    file_path = os.path.join(
        EXCEL_FOLDER,
        filename
    )

    if not os.path.isfile(file_path):
        return jsonify({
            "error": f"{filename} does not exist"
        }), 404

    try:

        workbook = load_workbook(file_path)

        sheet = workbook.active

        sheet.delete_rows(
            1,
            sheet.max_row
        )

        sheet.append([
            "S.No",
            "Date",
            "Write",
            "Recharged",
            "Balance"
        ])

        for index, entry in enumerate(
            entries,
            start=1
        ):

            sheet.append([
                index,
                entry.get("date", ""),
                entry.get("write", ""),
                entry.get("recharged", ""),
                entry.get("balance", "")
            ])

        workbook.save(file_path)
        workbook.close()

        return jsonify({
            "message": "Membership Excel updated",
            "filename": filename
        })

    except Exception as e:

        print(
            "ERROR UPDATING MEMBERSHIP:",
            repr(e)
        )

        return jsonify({
            "error": str(e)
        }), 500

    
@app.route("/download-member/<membership_no>")
def download_member(membership_no):

    membership_no = str(
        membership_no
    ).strip()

    filename = f"{membership_no}.xlsx"

    file_path = os.path.join(
        EXCEL_FOLDER,
        filename
    )

    if not os.path.isfile(file_path):

        return jsonify({
            "error": "Membership Excel file not found"
        }), 404

    return send_from_directory(
        EXCEL_FOLDER,
        filename,
        as_attachment=True
    )

FOLDER_PATH = r"C:\Users\DELL\Desktop\Fuskout\f2p\ex"

@app.route("/get-files")
def get_files():
    try:
        files = os.listdir(FOLDER_PATH)

        xlsx_files = [
            file for file in files
            if file.lower().endswith(".xlsx")
        ]

        return jsonify({
            "success": True,
            "total_files": len(xlsx_files),
            "files": xlsx_files
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        })


if __name__ == "__main__":

    app.run(
        debug=True,
        host="0.0.0.0",
        port=5000
    )