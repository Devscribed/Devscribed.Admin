(function () {
    // Login is implemented in a later spec. For now this page only needs to
    // exist so the "Create an account" link can navigate to /signup.
    const form = document.getElementById('login-form');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
    });
})();
