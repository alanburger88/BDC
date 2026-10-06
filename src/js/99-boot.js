/* Boot: restore the language preference, mount the shell and start routing. */
(function boot() {
  const saved = App.util.prefs.get('locale');
  const initial = App.i18n.LOCALES.includes(saved) ? saved : (App.record.locale || 'en-CA');
  if (initial !== App.i18n.locale) App.i18n.setLocale(initial);
  document.documentElement.lang = App.i18n.locale;

  // Fallback view for any section whose module failed to load
  [...App.SECTIONS, ...App.EXTRA_ROUTES].forEach((s) => {
    if (!App.router.views[s]) {
      App.router.registerView(s, {
        render(el) {
          el.appendChild(App.ui.sectionHeader({ title: t(`nav.${s}`) }));
        },
      });
    }
  });

  // Print: always render the dedicated notice layout (filled by the notice module)
  const preparePrint = () => { if (App.print && App.print.prepare) App.print.prepare(document.getElementById('print-root')); };
  window.addEventListener('beforeprint', preparePrint);
  if (window.matchMedia) {
    const mq = window.matchMedia('print');
    const onPrint = (e) => { if (e.matches) preparePrint(); };
    if (mq.addEventListener) mq.addEventListener('change', onPrint); else if (mq.addListener) mq.addListener(onPrint);
  }

  App.shell.mount();
  App.router.start();
  App.events.log('notice_opened', { id: App.record.noticeId });
  document.documentElement.classList.add('app-ready');
})();
