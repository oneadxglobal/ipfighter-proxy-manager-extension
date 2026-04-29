(function () {
    const theme = localStorage.getItem('proxyguard_theme') || 'light';
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();