document.addEventListener('DOMContentLoaded', () => {
    const staffList   = document.getElementById('staffList');
    const nameInput   = document.getElementById('nameInput');
    const amountInput = document.getElementById('amountInput');
    const reasonInput = document.getElementById('reasonInput');
    const companyBox  = document.getElementById('companyPurchase');
    const form        = document.getElementById('expenseForm');
    const status      = document.getElementById('saveStatus');

    // Clicking a staff name fills the Name field and highlights that row.
    staffList.addEventListener('click', (e) => {
        if (companyBox.checked) return; // disabled while it's a company purchase

        const item = e.target.closest('.staff-item');
        if (!item) return;

        staffList.querySelectorAll('.staff-item.selected')
            .forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');

        nameInput.value = item.dataset.name;
    });

    // Toggling "Company purchase" disables the staff list and clears any pick.
    companyBox.addEventListener('change', () => {
        staffList.classList.toggle('disabled', companyBox.checked);

        if (companyBox.checked) {
            staffList.querySelectorAll('.staff-item.selected')
                .forEach(el => el.classList.remove('selected'));
            nameInput.value = 'Company Purchase';
        } else {
            nameInput.value = '';
        }
    });

    // Submitting the form saves the entry.
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            name: nameInput.value.trim(),
            amount: amountInput.value,
            reason: reasonInput.value.trim(),
            company_purchase: companyBox.checked
        };

        status.textContent = 'Saving…';
        status.className = 'save-status';

        try {
            const res = await fetch('/save-expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Request failed');

            status.textContent = 'Saved.';
            status.className = 'save-status ok';

            // Reset amount + reason for the next entry, keep the name selected.
            amountInput.value = '';
            reasonInput.value = '';
            amountInput.focus();
        } catch (err) {
            status.textContent = "Couldn't save that — try again.";
            status.className = 'save-status err';
        }
    });
});