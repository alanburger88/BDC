/* Application shell: demo banner, header (logo, descriptor, language toggle),
 * section navigation (desktop tabs or compact "Sections" selector), main
 * view, footer and the Clair launcher. */
App.shell = (() => {
  let els = {};
  let compact = false;
  let selectorOpen = false;

  function logo() {
    if (App.assets.logo) {
      // Supplied BDC logo, embedded unaltered; height-only sizing keeps its aspect ratio.
      return h('img', { class: 'brand-logo', src: App.assets.logo, alt: 'BDC', width: 1280, height: 680, decoding: 'async' });
    }
    return h('span', { class: 'brand-placeholder' }, t('shell.logoPlaceholder'));
  }

  function buildLangToggle() {
    const mk = (loc, label) => h('button', {
      type: 'button',
      class: 'lang-btn',
      lang: loc,
      fid: `lang-${loc}`,
      'aria-pressed': String(App.i18n.locale === loc),
      on: { click: () => switchLocale(loc) },
    }, label);
    return h('div', { class: 'lang-toggle', role: 'group', 'aria-label': 'Language / Langue' },
      mk('en-CA', 'English'), h('span', { class: 'lang-sep', 'aria-hidden': 'true' }, '|'), mk('fr-CA', 'Français'));
  }

  function switchLocale(loc) {
    if (loc === App.i18n.locale) return;
    App.i18n.setLocale(loc);
  }

  function onLocaleChanged(next) {
    renderChrome();
    App.router.rerender();
    App.events.log('language_changed', { id: next });
    App.announce(t('shell.languageChanged'));
  }

  function tabs() {
    const cur = App.router.current().section;
    const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('shell.sectionsLabel') });
    App.SECTIONS.forEach((s) => {
      const selected = s === cur;
      list.appendChild(h('button', {
        type: 'button',
        role: 'tab',
        id: `tab-${s}`,
        class: 'tab',
        fid: `tab-${s}`,
        'aria-selected': String(selected),
        'aria-controls': 'view',
        tabindex: selected ? '0' : '-1',
        on: {
          click: () => App.router.go(App.router.href(s), { focus: `tab-${s}` }),
          keydown: onTabKey,
        },
      }, t(`nav.${s}`)));
    });
    return list;
  }

  function onTabKey(e) {
    const tabsEls = [...els.tabs.querySelectorAll('[role="tab"]')];
    const i = tabsEls.indexOf(e.currentTarget);
    let next = null;
    if (e.key === 'ArrowRight') next = tabsEls[(i + 1) % tabsEls.length];
    else if (e.key === 'ArrowLeft') next = tabsEls[(i - 1 + tabsEls.length) % tabsEls.length];
    else if (e.key === 'Home') next = tabsEls[0];
    else if (e.key === 'End') next = tabsEls[tabsEls.length - 1];
    if (!next) return;
    e.preventDefault();
    const s = next.id.replace('tab-', '');
    // Automatic activation: the panel renders instantly from local data.
    App.router.go(App.router.href(s), { focus: `tab-${s}` });
  }

  function measurer() {
    return h('div', { class: 'tabs tabs-measure', 'aria-hidden': 'true' }, App.SECTIONS.map((s) => h('span', { class: 'tab' }, t(`nav.${s}`))));
  }

  function selector() {
    const cur = App.router.current().section;
    const curLabel = App.SECTIONS.includes(cur) ? t(`nav.${cur}`) : t(`nav.${cur}`);
    const listId = 'section-list';
    const btn = h('button', {
      type: 'button',
      class: 'section-select-btn',
      fid: 'section-select',
      'aria-expanded': String(selectorOpen),
      'aria-controls': listId,
      on: { click: () => toggleSelector(), keydown: (e) => { if (e.key === 'Escape' && selectorOpen) { e.preventDefault(); toggleSelector(false); } } },
    }, h('span', null, t('shell.sectionsButton', { section: curLabel })), App.ui.icon('chevronDown', { class: 'section-select-chevron' }));
    const list = h('ul', { class: 'section-list', id: listId, hidden: !selectorOpen });
    App.SECTIONS.forEach((s) => {
      const active = s === cur;
      list.appendChild(h('li', null, h('a', {
        href: App.router.href(s),
        class: ['section-link', active ? 'is-active' : null],
        fid: `section-link-${s}`,
        'aria-current': active ? 'page' : null,
        on: {
          click: (e) => {
            e.preventDefault();
            toggleSelector(false, false);
            App.router.go(App.router.href(s), { focus: 'heading' });
          },
          keydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); toggleSelector(false); } },
        },
      }, h('span', { class: 'section-check', 'aria-hidden': 'true' }, active ? App.ui.icon('check', { size: 18 }) : null),
      h('span', null, t(`nav.${s}`)),
      active ? h('span', { class: 'section-current' }, t('shell.current')) : null)));
    });
    return h('div', { class: 'section-select' }, btn, list);
  }

  function toggleSelector(force, restoreFocus = true) {
    selectorOpen = force === undefined ? !selectorOpen : force;
    const btn = els.selector.querySelector('.section-select-btn');
    const list = els.selector.querySelector('.section-list');
    btn.setAttribute('aria-expanded', String(selectorOpen));
    list.hidden = !selectorOpen;
    if (selectorOpen) {
      const active = list.querySelector('[aria-current="page"]') || list.querySelector('a');
      if (active) active.focus();
    } else if (restoreFocus) {
      btn.focus();
    }
  }

  function checkFit() {
    if (!els.nav) return;
    const available = els.navWrap.clientWidth;
    const needed = els.measure.scrollWidth;
    const next = needed > available - 4;
    if (next !== compact) {
      compact = next;
      document.documentElement.classList.toggle('nav-compact', compact);
      updateViewRole();
    }
  }

  function updateViewRole() {
    const view = document.getElementById('view');
    if (!view) return;
    const section = App.router.current().section;
    if (!compact && App.SECTIONS.includes(section)) {
      view.setAttribute('role', 'tabpanel');
      view.setAttribute('aria-labelledby', `tab-${section}`);
      view.removeAttribute('aria-label');
    } else {
      view.setAttribute('role', 'region');
      view.removeAttribute('aria-labelledby');
      view.setAttribute('aria-label', t(`nav.${section}`));
    }
  }

  function renderNav() {
    App.util.clear(els.nav);
    els.tabs = tabs();
    els.selector = selector();
    els.measure = measurer();
    els.nav.append(els.tabs, els.selector, els.measure);
    checkFit();
  }

  function footer() {
    const b = App.build || {};
    return h('div', { class: 'container footer-inner' },
      h('div', { class: 'footer-brand' },
        h('p', { class: 'footer-demo' }, t('shell.banner')),
        h('p', { class: 'footer-small' }, t('shell.footerData'))),
      h('div', { class: 'footer-actions' },
        App.ui.button({ label: t('shell.demoInsights'), kind: 'ghost-light', iconName: 'trend', fid: 'footer-insights', href: App.router.href('insights'), onClick: (e) => { e.preventDefault(); App.router.go(App.router.href('insights'), { focus: 'heading' }); } }),
        App.ui.button({ label: t('shell.resetDemo'), kind: 'ghost-light', iconName: 'reset', fid: 'footer-reset', onClick: (e) => confirmReset(e.currentTarget) })),
      h('div', { class: 'footer-about' },
        App.ui.disclosure({
          summary: t('shell.aboutTitle'),
          fid: 'footer-about',
          className: 'disclosure--dark',
          content: () => [
            ...tv('shell.aboutBody').map((p) => h('p', null, p)),
            h('p', { class: 'footer-small' }, t('shell.buildInfo', { version: b.version || App.version, date: b.builtAt ? b.builtAt.slice(0, 10) : '-', notice: App.record.noticeId, record: App.record.recordVersion })),
          ],
        })));
  }

  function confirmReset(trigger) {
    App.overlay.open({
      id: 'reset',
      variant: 'dialog',
      title: t('shell.resetTitle'),
      trigger,
      render: (body, api) => {
        body.append(
          h('p', null, t('shell.resetBody')),
          h('div', { class: 'button-row' },
            App.ui.button({ label: t('shell.resetConfirm'), kind: 'primary', fid: 'reset-confirm', onClick: () => { api.close('confirm'); resetDemo(); } }),
            App.ui.button({ label: t('common.cancel'), kind: 'secondary', fid: 'reset-cancel', onClick: () => api.close('cancel') })));
      },
    });
  }

  function resetDemo() {
    App.session.reset();
    App.router.go('#/overview', { focus: 'heading' });
    App.announce(t('shell.resetDone'));
  }

  function renderChrome() {
    App.util.clear(els.banner).append(h('div', { class: 'container' }, h('p', null, t('shell.banner'))));
    App.util.clear(els.headerBar).append(
      h('div', { class: 'brand' }, logo()),
      h('div', { class: 'header-descriptor' },
        h('span', { class: 'descriptor-title' }, t('shell.descriptor')),
        h('span', { class: 'descriptor-meta' }, t('shell.descriptorMeta', { notice: App.record.noticeId }))),
      h('div', { class: 'header-tools' },
        h('span', { class: 'demo-pill' }, t('shell.demoPill')),
        buildLangToggle()));
    renderNav();
    App.util.clear(els.footer).append(footer());
    App.util.clear(els.skip).append(t('shell.skip'));
    renderLauncher();
  }

  function renderLauncher() {
    App.util.clear(els.launcher);
    els.launcher.append(h('button', {
      type: 'button',
      class: 'clair-launcher',
      fid: 'clair-launcher',
      'aria-haspopup': 'dialog',
      on: { click: (e) => { if (App.clair) App.clair.open({ kind: 'general', section: App.router.current().section }, e.currentTarget); } },
    }, App.ui.icon('chat'), h('span', { class: 'clair-launcher-text' }, h('span', { class: 'clair-launcher-name' }, 'Clair'), h('span', { class: 'clair-launcher-sub' }, t('shell.launcherSub')))));
  }

  function mount() {
    const app = document.getElementById('app');
    App.util.clear(app);
    els.skip = h('a', { class: 'skip-link', href: '#main', on: { click: (e) => { e.preventDefault(); App.util.focusEl(document.getElementById('main')); } } });
    els.banner = h('div', { class: 'demo-banner', role: 'note' });
    els.headerBar = h('div', { class: 'container header-bar' });
    els.nav = h('nav', { class: 'section-nav', 'aria-label': 'Notice sections / Sections de l’avis' });
    els.navWrap = h('div', { class: 'container nav-wrap' }, els.nav);
    els.header = h('header', { class: 'site-header' }, els.headerBar, els.navWrap);
    els.view = h('div', { id: 'view', class: 'view' });
    els.main = h('main', { id: 'main', tabindex: '-1' }, h('div', { class: 'container' }, els.view));
    els.footer = h('footer', { class: 'site-footer on-dark' });
    els.launcher = h('div', { class: 'launcher-wrap' });
    app.append(els.skip, els.banner, els.header, els.main, els.footer, els.launcher);
    renderChrome();
    if (window.ResizeObserver) new ResizeObserver(App.util.debounce(checkFit, 30)).observe(els.navWrap);
    window.addEventListener('resize', App.util.debounce(checkFit, 30));
    document.addEventListener('pointerdown', (e) => {
      if (selectorOpen && els.selector && !els.selector.contains(e.target)) toggleSelector(false, false);
    });
    App.i18n.onChange(onLocaleChanged);
  }

  // Called by the router on each navigation
  function update(route) {
    if (!els.nav) return;
    selectorOpen = false;
    renderNav();
    updateViewRole();
    document.documentElement.setAttribute('data-route', route.section);
  }

  return { mount, update, checkFit, isCompact: () => compact, resetDemo };
})();
