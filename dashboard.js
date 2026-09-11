document.addEventListener('DOMContentLoaded', () => {

    const cards = document.querySelectorAll('.flip-card');

    cards.forEach(card => {

        const toggle = () => {
            card.classList.toggle('is-flipped');
        };

        card.querySelectorAll('[data-flip]').forEach(btn => {
            btn.addEventListener('click', toggle);
        });

        // Enter / Space when card is focused
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });

    });

});
let username = localStorage.getItem("username");
let role;

if (username === "sanjay") {
    role = "manager";
}
    else if (username === "meena") {
        role = "owner";
        document.getElementById("ownertab").style.display = "block";
} else if (username === "rajesh") {
    role = "owner";
    document.getElementById("ownertab").style.display = "block";
} else {
    role = "user";
}


document.getElementById("username").textContent = username;
document.getElementById("role").textContent = role;
let loginTime = localStorage.getItem("loginTime");

document.getElementById("login-time").textContent = loginTime;
async function getExcelFiles() {
    try {
        const response = await fetch("/get-files");
        const data = await response.json();

        if (data.success) {
            document.getElementById("totalFiles").textContent = data.total_files;
        } else {
            console.error(data.error);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

getExcelFiles();
async function loadTodayPayments() {
    try {
        const response = await fetch("/api/payments");
        const result = await response.json();

        if (result.error) {
            console.error(result.error);
            return;
        }

        const today = new Date().toISOString().split("T")[0];

        let gpayTotal = 0;
        let cardTotal = 0;
        let cashTotal = 0;
        let overallTotal = 0;
        let totalTransactions = 0;

        for (const line of result.lines) {
            try {
                const data = JSON.parse(line);

                if (data.date !== today) {
                    continue;
                }

                const total = Number(data.total) || 0;

                if (data.paymentMethod === "GPay") {
                    gpayTotal += total;
                }

                if (data.paymentMethod === "Card") {
                    cardTotal += total;
                }

                if (data.paymentMethod === "Cash") {
                    cashTotal += total;
                }

                overallTotal += total;
                totalTransactions++;

            } catch (error) {
                console.error("Invalid JSON line:", line);
            }
        }

        document.getElementById("gpayTotal").textContent =
            gpayTotal.toFixed(2);

        document.getElementById("cardTotal").textContent =
            cardTotal.toFixed(2);

        document.getElementById("cashTotal").textContent =
            cashTotal.toFixed(2);

        document.getElementById("overallTotal").textContent =
            overallTotal.toFixed(2);


    } catch (error) {
        console.error("Could not load payments:", error);
    }
}

loadTodayPayments();