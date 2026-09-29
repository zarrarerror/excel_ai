/* UI for local provider preferences; it never sends keys or workbook data. */
window.RoutingSettings = (function () {
  function providerOptions(select, includeDefault) {
    select.replaceChildren();
    if (includeDefault) select.add(new Option('Use my default provider', 'default'));
    for (const [id, [label]] of Object.entries(ModelRouting.providers)) select.add(new Option(label, id));
  }
  function render(cfg) {
    const routing = ModelRouting.normalize(cfg.routing);
    const defaultSelect = document.getElementById('default-provider');
    providerOptions(defaultSelect, false); defaultSelect.value = cfg.provider || 'openrouter';
    document.getElementById('routing-enabled').checked = routing.enabled;
    const container = document.getElementById('routing-rules'); container.replaceChildren();
    for (const [category, label] of Object.entries(ModelRouting.categories)) {
      const field = document.createElement('div'); field.className = 'field';
      const title = document.createElement('label'); title.textContent = label; title.htmlFor = 'route-' + category;
      const provider = document.createElement('select'); provider.id = 'route-' + category;
      providerOptions(provider, true); provider.value = routing.routes[category].provider;
      const model = document.createElement('input'); model.id = 'route-model-' + category;
      model.placeholder = 'Model ID (blank = provider’s saved model)'; model.maxLength = 200;
      model.setAttribute('aria-label', label + ' model ID'); model.value = routing.routes[category].model;
      field.append(title, provider, model); container.appendChild(field);
    }
    document.getElementById('routing-enabled').onchange = refresh;
    document.getElementById('ai-mode').onchange = refresh;
    refresh();
  }
  function refresh() {
    const own = document.getElementById('ai-mode').value === 'own';
    const enabled = own && document.getElementById('routing-enabled').checked;
    document.getElementById('routing-enabled').disabled = !own;
    document.getElementById('routing-rules').disabled = !enabled;
    document.getElementById('task-route-row').style.display = enabled ? 'flex' : 'none';
    document.getElementById('routing-help').textContent = own
      ? 'Save keys in the provider tabs below. Each route uses that provider’s key. Blank model IDs use its saved model. Routing preferences and keys stay on this device; requests go to the selected provider.'
      : 'Shayntech uses the default hosted API. Choose “Use my own API key” above to enable personal model routing.';
  }
  function read() {
    const routes = {};
    for (const category of Object.keys(ModelRouting.categories)) routes[category] = {
      provider: document.getElementById('route-' + category).value,
      model: document.getElementById('route-model-' + category).value.trim()
    };
    return ModelRouting.normalize({ enabled: document.getElementById('routing-enabled').checked, routes });
  }
  return { render, refresh, read };
})();
