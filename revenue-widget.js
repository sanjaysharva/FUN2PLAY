/* =====================================================
   REVENUE WIDGET
   -----------------------------------------------------
   Polls /payment-revenue and /daily-revenue and fills in
   whichever of these elements exist on the current page:

     #gpay-total, #card-total, #cash-total, #daily-total,
     #revenue-date, #revenue-date-label, #last-updated,
     #bill-count, #last-bill-time, #last-bill-amount

   Safe to include on any page: every DOM lookup is
   guarded, so it simply skips elements that aren't there
   instead of throwing and killing the rest of the script.
   ===================================================== */

function getTodayDate() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

const revenueDate = document.getElementById("revenue-date");

// Only pages that actually have a #revenue-date input let the
// user pick a date; other pages (e.g. dashboard) just use today.
if (revenueDate) {
    revenueDate.value = getTodayDate();
}

async function updatePaymentRevenue() {
    try {
        const selectedDate = revenueDate ? revenueDate.value : getTodayDate();

        const response = await fetch(
            `/payment-revenue?date=${encodeURIComponent(selectedDate)}`,
            {
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Could not load payment revenue"
            );
        }

        const totals = data.paymentTotals || {};

        const gpayEl = document.getElementById("gpay-total");
        if (gpayEl) {
            gpayEl.textContent = `₹${Number(totals.GPay || 0).toFixed(2)}`;
        }

        const cardEl = document.getElementById("card-total");
        if (cardEl) {
            cardEl.textContent = `₹${Number(totals.Card || 0).toFixed(2)}`;
        }

        const cashEl = document.getElementById("cash-total");
        if (cashEl) {
            cashEl.textContent = `₹${Number(totals.Cash || 0).toFixed(2)}`;
        }

        const dailyTotalEl = document.getElementById("daily-total");
        if (dailyTotalEl) {
            dailyTotalEl.textContent = `₹${Number(data.totalRevenue || 0).toFixed(2)}`;
        }

        const dateLabelEl = document.getElementById("revenue-date-label");
        if (dateLabelEl) {
            dateLabelEl.textContent = selectedDate;
        }

        const lastUpdatedEl = document.getElementById("last-updated");
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = new Date().toLocaleTimeString();
        }

    } catch (error) {
        console.error("Payment revenue error:", error);
    }
}

// Update when the user selects another date (only on pages that have the picker)
if (revenueDate) {
    revenueDate.addEventListener(
        "change",
        updatePaymentRevenue
    );
}

async function updateDailyRevenue() {
    try {
        const today = getTodayDate();

        const response = await fetch(
            `/daily-revenue?date=${encodeURIComponent(today)}`,
            {
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not load revenue");
        }

        const totalRevenue = Number(data.totalRevenue || 0);
        const billCount = Number(data.billCount || 0);

        const dailyTotalEl = document.getElementById("daily-total");
        if (dailyTotalEl) {
            dailyTotalEl.textContent = `₹${totalRevenue.toFixed(2)}`;
        }

        const billCountEl = document.getElementById("bill-count");
        if (billCountEl) {
            billCountEl.textContent = billCount;
        }

        const entries = data.selectedDay?.entries || [];

        const lastBillTimeEl = document.getElementById("last-bill-time");
        const lastBillAmountEl = document.getElementById("last-bill-amount");

        if (entries.length > 0) {
            const latestBill = entries[entries.length - 1];

            if (lastBillTimeEl) {
                lastBillTimeEl.textContent = latestBill.time;
            }
            if (lastBillAmountEl) {
                lastBillAmountEl.textContent = `₹${Number(latestBill.total).toFixed(2)}`;
            }
        } else {
            if (lastBillTimeEl) {
                lastBillTimeEl.textContent = "No bills today";
            }
            if (lastBillAmountEl) {
                lastBillAmountEl.textContent = "₹0.00";
            }
        }

        const lastUpdatedEl2 = document.getElementById("last-updated");
        if (lastUpdatedEl2) {
            lastUpdatedEl2.textContent = new Date().toLocaleTimeString();
        }

    } catch (error) {
        console.error("Daily revenue error:", error);
    }
}

// Load immediately, then refresh every 5 seconds
updatePaymentRevenue();
updateDailyRevenue();
setInterval(updatePaymentRevenue, 5000);
setInterval(updateDailyRevenue, 5000);