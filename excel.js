/* =====================================================
   BILL DATA

   Collects the final bill's data — products, prices,
   quantities, and payment method — into a plain object
   whenever a bill is finalized, tagged with a running
   customer number (Customer 1, Customer 2, ...).

   Kept separate from bill.js so the raw bill data can be
   reused later (saving, sending, exporting, etc.) without
   pulling in any of the UI/DOM logic.
   ===================================================== */

const BillData = (function () {

    /* Holds the most recently finalized bill */

    let current = null;


    /* Holds every finalized bill so far, in order */

    const bills = [];


    /* Running customer count — Customer 1, Customer 2, ... */

    let customerCount = 0;


    /* =================================================
       COLLECT
       Builds a clean data object from the cart and the
       selected payment method, tags it with the next
       customer number, and stores it.
       ================================================= */

    function calculateTotals(cart) {

        const products = Object.values(cart || {}).map(item => ({
            name: item.name,
            price: Number(item.price) || 0,
            quantity: Number(item.quantity) || 0,
            total: (Number(item.price) || 0) * (Number(item.quantity) || 0)
        }));

        const totalQuantity = products.reduce(
            (sum, product) => sum + product.quantity,
            0
        );

        const subtotal = products.reduce(
            (sum, product) => sum + product.total,
            0
        );

        const taxRate = 0.18;
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        return {
            products,
            totalQuantity,
            subtotal,
            taxRate,
            tax,
            total
        };
    }

    function collect(cart, paymentMethod) {

        const totals = calculateTotals(cart);

        customerCount++;

        current = {
            customerNumber: customerCount,
            customerLabel: `Customer ${customerCount}`,
            products: totals.products,
            paymentMethod,
            totalQuantity: totals.totalQuantity,
            subtotal: totals.subtotal,
            taxRate: totals.taxRate,
            tax: totals.tax,
            total: totals.total,
            totalAmount: totals.total,
            createdAt: new Date()
        };

        bills.push(current);

        return current;

    }


    /* =================================================
       GET CURRENT
       Returns the most recently finalized bill.
       ================================================= */

    function getCurrent() {
        return current;
    }


    /* =================================================
       GET ALL
       Returns every finalized bill so far, in order.
       ================================================= */

    function getAll() {
        return bills;
    }


    /* =================================================
       GET BY CUSTOMER
       Returns a specific customer's bill by number
       (e.g. getByCustomer(3) for "Customer 3").
       ================================================= */

    function getByCustomer(customerNumber) {
        return bills.find(bill => bill.customerNumber === customerNumber);
    }

    /* =================================================
       TOTAL HELPERS
       These helpers can be called from any other JS file:
       BillData.calculateTotals(cart)
       BillData.getTotal(cart)
       BillData.getTotalAmount(bill)
       ================================================= */

    function getTotal(cart) {
        return calculateTotals(cart).total;
    }

    function getTotalAmount(bill = current) {
        return Number(bill?.totalAmount ?? bill?.total ?? 0);
    }

    function getTotalRevenue(billList = bills) {
        return (billList || []).reduce(
            (sum, bill) => sum + getTotalAmount(bill),
            0
        );
    }


    return {
        collect,
        getCurrent,
        getAll,
        getByCustomer,
        calculateTotals,
        getTotal,
        getTotalAmount,
        getTotalRevenue
    };

})();

/* Make the shared API available to other browser scripts. */
window.BillData = BillData;

function getBillTotal(cart) {
    return BillData.getTotal(cart);
}

window.getBillTotal = getBillTotal;

function getTotalRevenue() {
    return BillData.getTotalRevenue();
}

window.getTotalRevenue = getTotalRevenue;

async function getSavedRevenue() {
    const response = await fetch("/bill-revenue", {
        method: "GET",
        cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Could not load saved revenue"
        );
    }

    return data;
}

window.getSavedRevenue = getSavedRevenue;

async function getDailyRevenue(date = "") {
    const query = date
        ? `?date=${encodeURIComponent(date)}`
        : "";

    const response = await fetch(
        `/daily-revenue${query}`,
        {
            method: "GET",
            cache: "no-store"
        }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Could not load daily revenue"
        );
    }

    return data;
}

window.getDailyRevenue = getDailyRevenue;
window.BillData.getDailyRevenue = getDailyRevenue;

async function getDailyTotalRevenue(date = "") {
    const dailyRevenue = await getDailyRevenue(date);
    return dailyRevenue.totalRevenue;
}

window.getDailyTotalRevenue = getDailyTotalRevenue;
window.BillData.getDailyTotalRevenue = getDailyTotalRevenue;

function getCurrentRevenueDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function getOverallDailyTotal(date = "") {
    return getDailyTotalRevenue(date || getCurrentRevenueDate());
}

window.getOverallDailyTotal = getOverallDailyTotal;
window.BillData.getOverallDailyTotal = getOverallDailyTotal;

async function getPaymentRevenue(date = "") {
    const query = date
        ? `?date=${encodeURIComponent(date)}`
        : "";
    const response = await fetch(
        `/payment-revenue${query}`,
        {
            method: "GET",
            cache: "no-store"
        }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Could not load payment revenue"
        );
    }

    return data;
}

async function getPaymentTotal(paymentMethod, date = "") {
    const paymentRevenue = await getPaymentRevenue(date);
    return Number(
        paymentRevenue.paymentTotals[paymentMethod] || 0
    );
}

window.getPaymentRevenue = getPaymentRevenue;
window.getPaymentTotal = getPaymentTotal;
window.BillData.getPaymentRevenue = getPaymentRevenue;
window.BillData.getPaymentTotal = getPaymentTotal;

function watchPaymentRevenue(
    onUpdate,
    date = "",
    intervalMs = 5000
) {
    if (typeof onUpdate !== "function") {
        throw new TypeError("onUpdate must be a function");
    }

    let stopped = false;

    const update = async () => {
        try {
            const revenue = await getPaymentRevenue(date);
            if (!stopped) {
                onUpdate(revenue);
            }
        } catch (error) {
            console.error(
                "Could not update payment revenue:",
                error
            );
        }
    };

    update();
    const timer = setInterval(update, intervalMs);

    return function stopWatchingPaymentRevenue() {
        stopped = true;
        clearInterval(timer);
    };
}

window.watchPaymentRevenue = watchPaymentRevenue;
window.BillData.watchPaymentRevenue = watchPaymentRevenue;

function watchDailyTotal(
    onUpdate,
    date = "",
    intervalMs = 5000
) {
    if (typeof onUpdate !== "function") {
        throw new TypeError("onUpdate must be a function");
    }

    let stopped = false;

    const update = async () => {
        try {
            const total = await getOverallDailyTotal(date);
            if (!stopped) {
                onUpdate(total);
            }
        } catch (error) {
            console.error("Could not update daily total:", error);
        }
    };

    update();
    const timer = setInterval(update, intervalMs);

    return function stopWatchingDailyTotal() {
        stopped = true;
        clearInterval(timer);
    };
}

window.watchDailyTotal = watchDailyTotal;
window.BillData.watchDailyTotal = watchDailyTotal;

async function saveBillToExcel(bill = BillData.getCurrent()) {
    if (!bill) {
        throw new Error("There is no bill to save");
    }

    const response = await fetch("/save-bill", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(bill)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || data.message || "Could not save bill");
    }

    return data;
}

window.saveBillToExcel = saveBillToExcel;