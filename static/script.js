function validateForm() {
    let username = document.getElementById("username").value.trim();
    let password = document.getElementById("password").value;

    fetch('/static/data.json')
        .then(response => response.json())
        .then(data => {

            let user = data.users.find(user =>
                username === user.name &&
                password === user.password
            );

            if (user) {

                let currentTime = new Date().toLocaleTimeString();

                console.log("Current Time:", currentTime);

                localStorage.setItem("loginTime", currentTime);
                localStorage.setItem("username", user.name);
                localStorage.setItem("password", user.password);


                window.location.href = "/dashboard";

            } else {
                alert("Invalid username or password.");
            }

        })
        .catch(error => {
            console.error("Error loading data:", error);
            alert("Unable to load login data.");
        });
}