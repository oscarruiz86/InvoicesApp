(function () {
  function selectRememberMeByDefault() {
    var checkbox = document.querySelector('input[name="rememberMe"]');
    if (checkbox && !checkbox.checked) checkbox.checked = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', selectRememberMeByDefault, { once: true });
  } else {
    selectRememberMeByDefault();
  }
})();
