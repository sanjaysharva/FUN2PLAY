document.addEventListener("DOMContentLoaded", () => {
    const excelBody = document.getElementById("excelBody");
    const memberSearchInput = document.getElementById("memberSearchInput");
    const memberSearchBtn = document.getElementById("memberSearchBtn");
    const memberSearchStatus = document.getElementById("memberSearchStatus");

    const purchaseWrite = document.getElementById("purchaseWrite");
    const purchaseBalance = document.getElementById("purchaseBalance");
    const purchaseDate = document.getElementById("purchaseDate");
    const purchaseRecharged = document.getElementById("purchaseRecharged");
    const purchaseUsed = document.getElementById("purchaseUsed");
    const purchaseSaveBtn = document.getElementById("purchaseSaveBtn");

    const excelRefreshBtn = document.getElementById("excelRefreshBtn");
    const excelDownloadBtn = document.getElementById("excelDownloadBtn");

    let currentMembershipNo = "";
    let currentEntries = [];
    let editingSnapshot = [];
    let editingEnabled = false;

    const MEMBER_COLUMNS = [
        "S.No",
        "Date",
        "Purchase",
        "Balance",
        "Used",
        "Recharged"
    ];

    function setStatus(element, message, type = null) {
        if (!element) return;

        element.textContent = message;
        element.classList.remove("is-success", "is-error");

        if (type) {
            element.classList.add(type);
        }
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function cleanMoney(value) {
        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replace(/₹/g, "")
            .replace(/,/g, "")
            .trim();
    }

    function formatMoney(value) {
        if (value === null || value === undefined || value === "") {
            return "";
        }

        const cleaned = cleanMoney(value);
        const number = Number(cleaned);

        if (Number.isNaN(number)) {
            return escapeHTML(value);
        }

        return `₹${number.toFixed(2)}`;
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }

        const text = String(value).trim();

        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return text;
        }

        const date = new Date(text);

        if (!Number.isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");

            return `${year}-${month}-${day}`;
        }

        return text;
    }

    function todayISO() {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().slice(0, 10);
    }

    function normalizeEntry(entry) {
        const purchase = entry?.purchase ?? entry?.write ?? entry?.description ?? "";

        return {
            date: formatDate(entry?.date ?? ""),
            purchase: String(purchase),
            recharged: cleanMoney(entry?.recharged ?? ""),
            balance: cleanMoney(entry?.balance ?? ""),
            used: cleanMoney(entry?.used ?? "")
        };
    }

    function normalizeEntries(data) {
        let entries = [];

        if (Array.isArray(data)) {
            entries = data;
        } else if (Array.isArray(data?.entries)) {
            entries = data.entries;
        } else if (Array.isArray(data?.data)) {
            entries = data.data;
        }

        return entries
            .map(normalizeEntry)
            .filter(entry => {
                return (
                    entry.date !== "" ||
                    entry.purchase !== "" ||
                    entry.recharged !== "" ||
                    entry.balance !== "" ||
                    entry.used !== ""
                );
            });
    }

    function createEditToolbar() {
        const toolbar = document.querySelector(".excel-toolbar-actions");

        if (!toolbar) {
            return;
        }

        if (!document.getElementById("excelEditBtn")) {
            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.id = "excelEditBtn";
            editButton.className = "excel-toolbar-btn";
            editButton.textContent = "✏️ Edit";
            editButton.addEventListener("click", toggleEditing);
            toolbar.insertBefore(editButton, toolbar.firstChild);
        }

        if (!document.getElementById("excelAddRowBtn")) {
            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.id = "excelAddRowBtn";
            addButton.className = "excel-toolbar-btn";
            addButton.textContent = "➕ Add Row";
            addButton.style.display = "none";
            addButton.addEventListener("click", addNewRow);
            toolbar.insertBefore(addButton, toolbar.firstChild);
        }

        if (!document.getElementById("excelSaveEditBtn")) {
            const saveButton = document.createElement("button");
            saveButton.type = "button";
            saveButton.id = "excelSaveEditBtn";
            saveButton.className = "excel-toolbar-btn excel-toolbar-btn--primary";
            saveButton.textContent = "💾 Save Changes";
            saveButton.style.display = "none";
            saveButton.addEventListener("click", savePreviewChanges);
            toolbar.insertBefore(saveButton, toolbar.firstChild);
        }
    }

    function renderGrid(entries) {
        if (!excelBody) {
            return;
        }

        excelBody.innerHTML = "";

        const preview = document.querySelector(".excel-preview");
        if (preview) {
            preview.classList.toggle("is-editing", editingEnabled);
        }

        if (!entries.length) {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td class="excel-row-number">1</td>
                <td class="excel-sno">1</td>
                <td colspan="5" class="excel-empty">
                    No data
                </td>
                <td class="excel-action-header"></td>
            `;

            excelBody.appendChild(row);
            return;
        }

        entries.forEach((entry, index) => {
            const row = document.createElement("tr");
            row.dataset.index = index;

            const snoCell = document.createElement("td");
            snoCell.className = "excel-row-number";
            snoCell.textContent = index + 1;
            row.appendChild(snoCell);

            const serialCell = document.createElement("td");
            serialCell.className = "excel-sno";
            serialCell.textContent = index + 1;
            row.appendChild(serialCell);

            const dateCell = document.createElement("td");
            dateCell.dataset.column = "1";
            dateCell.className = "excel-editable";
            dateCell.textContent = formatDate(entry.date);

            const writeCell = document.createElement("td");
            writeCell.dataset.column = "2";
            writeCell.className = "excel-editable";
            writeCell.textContent = entry.purchase ?? "";

            const balanceCell = document.createElement("td");
            balanceCell.dataset.column = "3";
            balanceCell.className = "excel-editable";
            balanceCell.textContent = formatMoney(entry.balance);

            const usedCell = document.createElement("td");
            usedCell.dataset.column = "4";
            usedCell.className = "excel-editable";
            usedCell.textContent = formatMoney(entry.used);

            const rechargedCell = document.createElement("td");
            rechargedCell.dataset.column = "5";
            rechargedCell.className = "excel-editable";
            rechargedCell.textContent = formatMoney(entry.recharged);

            row.appendChild(dateCell);
            row.appendChild(writeCell);
            row.appendChild(balanceCell);
            row.appendChild(usedCell);
            row.appendChild(rechargedCell);

            if (editingEnabled) {
                makeCellEditable(dateCell);
                makeCellEditable(writeCell);
                makeCellEditable(balanceCell);
                makeCellEditable(usedCell);
                makeCellEditable(rechargedCell);

                const deleteCell = document.createElement("td");
                deleteCell.className = "excel-delete-cell";

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "excel-delete-row";
                deleteButton.textContent = "🗑️";
                deleteButton.title = "Delete row";

                deleteButton.addEventListener("click", () => {
                    const rowIndex = Number(row.dataset.index);

                    if (!Number.isNaN(rowIndex)) {
                            currentEntries = readEditedRows();
                            currentEntries.splice(rowIndex, 1);
                            renderGrid(currentEntries);
                    }
                });

                deleteCell.appendChild(deleteButton);
                row.appendChild(deleteCell);
            }

            excelBody.appendChild(row);
        });
    }

    function makeCellEditable(cell) {
        cell.contentEditable = "true";
        cell.classList.add("is-editing");

        cell.addEventListener("focus", () => {
            cell.classList.add("is-focused");
        });

        cell.addEventListener("blur", () => {
            cell.classList.remove("is-focused");
        });

        cell.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                cell.blur();
            }
        });
    }

    function readEditedRows() {
        const rows = excelBody.querySelectorAll("tr");
        const updatedEntries = [];

        rows.forEach(row => {
            const editableCells = row.querySelectorAll(".excel-editable");

            if (!editableCells.length) {
                return;
            }

            let date = "";
            let purchase = "";
            let balance = "";
            let used = "";
            let recharged = "";

            editableCells.forEach(cell => {
                const column = Number(cell.dataset.column);
                const value = cell.textContent.trim();

                if (column === 1) {
                    date = formatDate(value);
                }

                if (column === 2) {
                    purchase = value;
                }

                if (column === 3) {
                    balance = cleanMoney(value);
                }

                if (column === 4) {
                    used = cleanMoney(value);
                }

                if (column === 5) {
                    recharged = cleanMoney(value);
                }
            });

            if (
                date !== "" ||
                purchase !== "" ||
                recharged !== "" ||
                balance !== "" ||
                used !== ""
            ) {
                updatedEntries.push({
                    date,
                    purchase,
                    write: purchase,
                    recharged,
                    balance,
                    used
                });
            }
        });

        return updatedEntries;
    }

    function toggleEditing() {
        if (!currentMembershipNo) {
            setStatus(
                memberSearchStatus,
                "Search a membership first",
                "is-error"
            );
            return;
        }

        editingEnabled = !editingEnabled;

        const editButton = document.getElementById("excelEditBtn");
        const addButton = document.getElementById("excelAddRowBtn");
        const saveButton = document.getElementById("excelSaveEditBtn");

        if (editingEnabled) {
            editingSnapshot = currentEntries.map(entry => ({ ...entry }));
            editButton.textContent = "✖️ Cancel";
            addButton.style.display = "inline-flex";
            saveButton.style.display = "inline-flex";
            renderGrid(currentEntries);

            setStatus(
                memberSearchStatus,
                "Editing preview",
                null
            );
        } else {
            currentEntries = editingSnapshot.map(entry => ({ ...entry }));
            editButton.textContent = "✏️ Edit";
            addButton.style.display = "none";
            saveButton.style.display = "none";

            renderGrid(currentEntries);

            setStatus(
                memberSearchStatus,
                "Editing cancelled",
                null
            );
        }
    }

    function addNewRow() {
        if (!editingEnabled) {
            return;
        }

        currentEntries = readEditedRows();
        currentEntries.push({
            date: todayISO(),
            purchase: "",
            recharged: "",
            balance: "",
            used: ""
        });

        renderGrid(currentEntries);

        const rows = excelBody.querySelectorAll("tr");
        const lastRow = rows[rows.length - 1];

        if (lastRow) {
            const firstCell = lastRow.querySelector(
                '.excel-editable[data-column="1"]'
            );

            if (firstCell) {
                firstCell.focus();

                const selection = window.getSelection();
                const range = document.createRange();

                range.selectNodeContents(firstCell);
                range.collapse(false);

                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    async function savePreviewChanges() {
        if (!currentMembershipNo) {
            setStatus(
                memberSearchStatus,
                "No membership selected",
                "is-error"
            );
            return;
        }

        const updatedEntries = readEditedRows();

        const saveButton = document.getElementById("excelSaveEditBtn");

        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }

        setStatus(
            memberSearchStatus,
            "Saving changes...",
            null
        );

        try {
            const response = await fetch("/update-member", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    membershipNo: currentMembershipNo,
                    entries: updatedEntries
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "Could not save changes"
                );
            }

            editingEnabled = false;

            const editButton = document.getElementById("excelEditBtn");
            const addButton = document.getElementById("excelAddRowBtn");
            const saveChangesButton = document.getElementById("excelSaveEditBtn");

            if (editButton) {
                editButton.textContent = "✏️ Edit";
            }

            if (addButton) {
                addButton.style.display = "none";
            }

            if (saveChangesButton) {
                saveChangesButton.style.display = "none";
            }

            editingSnapshot = [];
            await loadMember(currentMembershipNo);

            setStatus(
                memberSearchStatus,
                "Changes saved successfully",
                "is-success"
            );
        } catch (error) {
            console.error("Preview save error:", error);

            setStatus(
                memberSearchStatus,
                error.message || "Could not save changes",
                "is-error"
            );
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = "💾 Save Changes";
            }
        }
    }

    async function loadMember(membershipNo) {
        const memberNo = String(membershipNo || "").trim();

        if (!memberNo) {
            return;
        }

        currentMembershipNo = memberNo;

        setStatus(
            memberSearchStatus,
            "Loading membership...",
            null
        );

        try {
            const response = await fetch(
                `/search-member/${encodeURIComponent(memberNo)}?_=${Date.now()}`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Membership not found"
                );
            }

            currentEntries = normalizeEntries(data);
            const fileName = document.getElementById("excelFileName");
            if (fileName) {
                fileName.textContent = `Member ${memberNo}`;
            }
            editingEnabled = false;
            editingSnapshot = [];

            const editButton = document.getElementById("excelEditBtn");
            const addButton = document.getElementById("excelAddRowBtn");
            const saveButton = document.getElementById("excelSaveEditBtn");

            if (editButton) {
                editButton.textContent = "✏️ Edit";
            }

            if (addButton) {
                addButton.style.display = "none";
            }

            if (saveButton) {
                saveButton.style.display = "none";
            }

            renderGrid(currentEntries);

            setStatus(
                memberSearchStatus,
                `${currentEntries.length} record${currentEntries.length === 1 ? "" : "s"} found`,
                "is-success"
            );
        } catch (error) {
            console.error("Membership load error:", error);

            currentEntries = [];
            editingSnapshot = [];
            renderGrid([]);

            setStatus(
                memberSearchStatus,
                error.message || "Could not load membership",
                "is-error"
            );
        }
    }

    async function searchMember() {
        if (!memberSearchInput) {
            return;
        }

        const membershipNo = memberSearchInput.value.trim();

        if (!membershipNo) {
            setStatus(
                memberSearchStatus,
                "Enter membership number",
                "is-error"
            );
            return;
        }

        await loadMember(membershipNo);
    }

    async function savePurchase() {
        if (!currentMembershipNo) {
            setStatus(
                memberSearchStatus,
                "Search a membership first",
                "is-error"
            );
            return;
        }

        const date = purchaseDate?.value || "";
        const write = purchaseWrite?.value.trim() || "";
        const recharged = cleanMoney(
            purchaseRecharged?.value || ""
        );
        const balance = cleanMoney(
            purchaseBalance?.value || ""
        );
        const used = cleanMoney(
            purchaseUsed?.value || ""
        );

        if (!date) {
            setStatus(
                memberSearchStatus,
                "Select a date",
                "is-error"
            );
            return;
        }

        if (
            write === "" &&
            recharged === "" &&
            balance === "" &&
            used === ""
        ) {
            setStatus(
                memberSearchStatus,
                "Enter purchase details",
                "is-error"
            );
            return;
        }

        if (purchaseSaveBtn) {
            purchaseSaveBtn.disabled = true;
            purchaseSaveBtn.textContent = "Saving...";
        }

        try {
            const response = await fetch("/save-member", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    membershipNo: currentMembershipNo,
                    date,
                    purchase: write,
                    write,
                    recharged,
                    balance,
                    used
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "Could not save purchase"
                );
            }

            if (purchaseWrite) {
                purchaseWrite.value = "";
            }

            if (purchaseRecharged) {
                purchaseRecharged.value = "";
            }

            if (purchaseUsed) {
                purchaseUsed.value = "";
            }

            if (purchaseBalance) {
                purchaseBalance.value = "";
            }

            await loadMember(currentMembershipNo);

            setStatus(
                memberSearchStatus,
                "Purchase saved successfully",
                "is-success"
            );
        } catch (error) {
            console.error("Purchase save error:", error);

            setStatus(
                memberSearchStatus,
                error.message || "Could not save purchase",
                "is-error"
            );
        } finally {
            if (purchaseSaveBtn) {
                purchaseSaveBtn.disabled = false;
                purchaseSaveBtn.textContent = "Save";
            }
        }
    }

    function refreshMember() {
        if (!currentMembershipNo) {
            setStatus(
                memberSearchStatus,
                "Search a membership first",
                "is-error"
            );
            return;
        }

        editingEnabled = false;
        loadMember(currentMembershipNo);
    }

    function downloadMember() {
        if (!currentMembershipNo) {
            setStatus(
                memberSearchStatus,
                "Search a membership first",
                "is-error"
            );
            return;
        }

        window.location.href =
            `/download-member/${encodeURIComponent(currentMembershipNo)}`;
    }

    createEditToolbar();

    if (purchaseDate && !purchaseDate.value) {
        purchaseDate.value = todayISO();
    }

    if (memberSearchBtn) {
        memberSearchBtn.addEventListener(
            "click",
            searchMember
        );
    }

    if (memberSearchInput) {
        memberSearchInput.addEventListener(
            "keydown",
            event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    searchMember();
                }
            }
        );
    }

    if (purchaseSaveBtn) {
        purchaseSaveBtn.addEventListener(
            "click",
            savePurchase
        );
    }

    if (excelRefreshBtn) {
        excelRefreshBtn.addEventListener(
            "click",
            refreshMember
        );
    }

    if (excelDownloadBtn) {
        excelDownloadBtn.addEventListener(
            "click",
            downloadMember
        );
    }

    renderGrid([]);
});