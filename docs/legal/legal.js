// Sections repliables des pages juridiques (voir legal.css). La page reste entièrement lisible sans ce script : les sections sont des <details>, que le navigateur ouvre et ferme seul.
(function () {
  var sections = Array.prototype.slice.call(document.querySelectorAll('details.sec'));
  var button = document.getElementById('toggle-all');
  if (sections.length === 0) {
    return;
  }

  function allOpen() {
    return sections.every(function (section) { return section.open; });
  }

  function refreshButton() {
    if (button) {
      button.textContent = allOpen() ? 'Tout replier' : 'Tout déplier';
    }
  }

  // Un lien vers une section (#s7, depuis l'app ou un autre texte) l'ouvre avant d'y aller.
  function openFromHash() {
    var id = decodeURIComponent((location.hash || '').slice(1));
    var target = id ? document.getElementById(id) : null;
    if (target && target.tagName === 'DETAILS') {
      target.open = true;
      target.scrollIntoView();
    }
  }

  if (button) {
    button.addEventListener('click', function () {
      var open = !allOpen();
      sections.forEach(function (section) { section.open = open; });
      refreshButton();
    });
  }
  sections.forEach(function (section) { section.addEventListener('toggle', refreshButton); });
  // Imprimer ou enregistrer en PDF doit donner le texte entier, pas les seuls titres.
  window.addEventListener('beforeprint', function () { sections.forEach(function (section) { section.open = true; }); });
  window.addEventListener('hashchange', openFromHash);

  openFromHash();
  refreshButton();
})();
