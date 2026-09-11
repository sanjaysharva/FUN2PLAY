/* =====================================================
   PRODUCT TABS
   ===================================================== */

const productTabs = document.querySelectorAll(".product-tab");
const productPanels = document.querySelectorAll(".product-panel");

productTabs.forEach(tab => {

    tab.addEventListener("click", () => {

        const target = tab.dataset.tab;

        productTabs.forEach(t => {
            t.classList.remove("active");
        });

        productPanels.forEach(panel => {
            panel.classList.remove("active");
        });

        tab.classList.add("active");

        document
            .getElementById(target)
            .classList.add("active");
    });

});


/* =====================================================
   SEARCH DROPDOWN
   ===================================================== */

const searchInput = document.getElementById("productSearch");
const searchDropdown = document.getElementById("searchDropdown");

searchInput.addEventListener("focus", () => {
    searchDropdown.classList.add("show");
});

searchInput.addEventListener("input", () => {

    const search = searchInput.value.toLowerCase();

    const results = searchDropdown.querySelectorAll(".search-result");

    results.forEach(result => {

        const text = result.textContent.toLowerCase();

        if (text.includes(search)) {
            result.style.display = "flex";
        } else {
            result.style.display = "none";
        }

    });

    searchDropdown.classList.add("show");
});


/* Close dropdown when clicking outside */

document.addEventListener("click", event => {

    if (!event.target.closest(".product-search")) {
        searchDropdown.classList.remove("show");
    }

});
/* =====================================================
   BILLING SYSTEM
   ===================================================== */

const products = document.querySelectorAll(".product-row");

const billItems = document.getElementById("billItems");
const billQuantity = document.getElementById("billQuantity");
const billSubtotal = document.getElementById("billSubtotal");
const billTax = document.getElementById("billTax");
const billTotal = document.getElementById("billTotal");


/* Store selected products */

const cart = {};


/* =====================================================
   PLUS / MINUS BUTTONS
   ===================================================== */

products.forEach(product => {

    const plusButton = product.querySelector(".plus");
    const minusButton = product.querySelector(".minus");
    const quantityDisplay = product.querySelector(".quantity");

    const name = product.dataset.name;
    const price = Number(product.dataset.price);


    /* PLUS */

    plusButton.addEventListener("click", () => {

        if (!cart[name]) {

            cart[name] = {
                name: name,
                price: price,
                quantity: 0
            };

        }

        cart[name].quantity++;

        quantityDisplay.textContent = cart[name].quantity;

        updateBill();

    });


    /* MINUS */

    minusButton.addEventListener("click", () => {

        if (!cart[name]) {
            return;
        }

        if (cart[name].quantity > 0) {
            cart[name].quantity--;
        }

        quantityDisplay.textContent = cart[name].quantity;


        /* Remove from cart if quantity becomes 0 */

        if (cart[name].quantity === 0) {
            delete cart[name];
        }

        updateBill();

    });

});


/* =====================================================
   UPDATE BILL
   ===================================================== */

function updateBill() {

    /* Clear old bill items */

    billItems.innerHTML = "";


    /* Get selected products and totals from the shared BillData module */

    const totals = BillData.calculateTotals(cart);
    const selectedProducts = totals.products;


    /* Nothing selected */

    if (selectedProducts.length === 0) {

        billItems.innerHTML = `
            <div class="empty-bill">
                No products selected
            </div>
        `;

    }


    /* Add products to bill */

    selectedProducts.forEach(product => {

        const itemTotal = product.price * product.quantity;

        const billItem = document.createElement("div");

        billItem.className = "bill-item";


        billItem.innerHTML = `
            <div>
                <strong>${product.name}</strong>
                <span>
                    ₹${product.price.toFixed(2)}
                    × ${product.quantity}
                </span>
            </div>

            <div class="bill-item-price">
                ₹${itemTotal.toFixed(2)}
            </div>
        `;


        billItems.appendChild(billItem);

    });


    /* =================================================
       TAX
       ================================================= */

    /* =================================================
       UPDATE BILL
       ================================================= */

    billQuantity.textContent = totals.totalQuantity;

    billSubtotal.textContent =
        `₹${totals.subtotal.toFixed(2)}`;

    billTax.textContent =
        `₹${totals.tax.toFixed(2)}`;

    billTotal.textContent =
        `₹${BillData.getTotalAmount(totals).toFixed(2)}`;

}

/* =====================================================
   PAYMENT METHOD
   ===================================================== */

const paymentMethods =
    document.querySelectorAll(".payment-method");

const paymentVerified =
    document.getElementById("paymentVerified");

const finalBillBtn =
    document.getElementById("finalBillBtn");


let selectedPayment = null;


/* =====================================================
   SELECT PAYMENT METHOD
   ===================================================== */

paymentMethods.forEach(method => {

    method.addEventListener("click", () => {

        paymentMethods.forEach(item => {
            item.classList.remove("active");
        });

        method.classList.add("active");

        selectedPayment =
            method.dataset.method;

        checkPaymentStatus();

    });

});


/* =====================================================
   PAYMENT CHECKBOX
   ===================================================== */

paymentVerified.addEventListener("change", () => {

    checkPaymentStatus();

});


/* =====================================================
   ENABLE FINAL BILL BUTTON
   ===================================================== */

function checkPaymentStatus() {

    const hasProducts =
        Object.keys(cart).length > 0;

    const paymentSelected =
        selectedPayment !== null;

    const paymentDone =
        paymentVerified.checked;


    if (
        hasProducts &&
        paymentSelected &&
        paymentDone
    ) {

        finalBillBtn.disabled = false;

    } else {

        finalBillBtn.disabled = true;

    }

}
/* =====================================================
   FINAL BILL / SUCCESS MODAL
   ===================================================== */

const billModalOverlay = document.getElementById("billModalOverlay");
const modalBillPreview = document.getElementById("modalBillPreview");
const modalPrintBtn = document.getElementById("modalPrintBtn");
const modalSkipBtn = document.getElementById("modalSkipBtn");


/* Build a compact receipt-style preview from the collected bill data */

function renderBillPreview(bill) {

    const dateStr = bill.createdAt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });

    const timeStr = bill.createdAt.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
    });

    const itemsHtml = bill.products.map(product => `
        <div class="receipt-item">
            <div class="receipt-item-main">
                <span class="receipt-item-name">${product.name}</span>
                <span class="receipt-item-qty">× ${product.quantity}</span>
            </div>
            <span class="receipt-item-price">₹${product.total.toFixed(2)}</span>
        </div>
    `).join("");

    modalBillPreview.innerHTML = `
        <div class="receipt">

            <div class="receipt-store">Fun 2 Play</div>
            <div class="receipt-customer">${bill.customerLabel}</div>
            <div class="receipt-meta">${dateStr} &nbsp;•&nbsp; ${timeStr}</div>

            <div class="receipt-divider"></div>

            <div class="receipt-items">
                ${itemsHtml}
            </div>

            <div class="receipt-divider"></div>

            <div class="receipt-row">
                <span>Total Quantity</span>
                <strong>${bill.totalQuantity}</strong>
            </div>

            <div class="receipt-row">
                <span>Subtotal</span>
                <strong>₹${bill.subtotal.toFixed(2)}</strong>
            </div>

            <div class="receipt-row">
                <span>Tax (18%)</span>
                <strong>₹${bill.tax.toFixed(2)}</strong>
            </div>

            <div class="receipt-divider receipt-divider--dashed"></div>

            <div class="receipt-total">
                <span>Total Paid</span>
                <strong>₹${bill.total.toFixed(2)}</strong>
            </div>

            <div class="receipt-payment">
                Paid via <strong>${bill.paymentMethod}</strong>
            </div>

        </div>
    `;

}


/* Show the modal with the finalized bill's preview */

function showBillModal(bill) {

    renderBillPreview(bill);

    billModalOverlay.classList.add("show");

}


/* Hide the modal */

function hideBillModal() {

    billModalOverlay.classList.remove("show");

}


/* =====================================================
   RESET FOR NEXT CUSTOMER
   ===================================================== */

function resetForNextCustomer() {

    /* Clear cart */

    Object.keys(cart).forEach(key => delete cart[key]);


    /* Reset all quantity displays */

    products.forEach(product => {
        product.querySelector(".quantity").textContent = "0";
    });


    /* Reset payment method */

    selectedPayment = null;

    paymentMethods.forEach(method => {
        method.classList.remove("active");
    });


    /* Reset payment verification checkbox */

    paymentVerified.checked = false;


    /* Refresh bill totals */

    updateBill();


    /* Disable the final bill button again */

    checkPaymentStatus();


    /* Back to the Coins tab, ready for the next customer */

    productTabs.forEach(t => t.classList.remove("active"));
    productPanels.forEach(panel => panel.classList.remove("active"));

    document.querySelector('.product-tab[data-tab="coins"]').classList.add("active");
    document.getElementById("coins").classList.add("active");

}


finalBillBtn.addEventListener("click", async () => {

    if (finalBillBtn.disabled) {
        return;
    }


    /* Collect the final bill data into excel.js */

    const finalBill = BillData.collect(cart, selectedPayment);

    console.log("Final Bill Data:", finalBill);


    /* Send it to the backend and only show success after it is saved */

    finalBillBtn.disabled = true;
    const buttonLabel = finalBillBtn.querySelector("span");
    const originalLabel = buttonLabel ? buttonLabel.textContent : "";

    if (buttonLabel) {
        buttonLabel.textContent = "Saving bill...";
    }

    try {
        await saveBillToExcel(finalBill);
        showBillModal(finalBill);
    } catch (error) {
        console.error("Bill save error:", error);
        alert(error.message || "The bill could not be saved");
    } finally {
        if (buttonLabel) {
            buttonLabel.textContent = originalLabel || "Generate Final Bill";
        }

        checkPaymentStatus();
    }

});


/* PRINT — print the bill, then automatically reset for the next customer */

modalPrintBtn.addEventListener("click", () => {

    window.print();

});

window.addEventListener("afterprint", () => {

    if (billModalOverlay.classList.contains("show")) {
        hideBillModal();
        resetForNextCustomer();
    }

});


/* SKIP — close the modal and reset for the next customer without printing */

modalSkipBtn.addEventListener("click", () => {

    hideBillModal();
    resetForNextCustomer();

});

/* Payment-revenue / daily-revenue polling now lives in revenue-widget.js,
   which this page also loads (see bill.html's <script> tags below the
   billing UI logic above). Keeping it in one place avoids the two
   copies drifting apart. */