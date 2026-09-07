/**
 * D3.js Dependency Tree Visualizer for Python Package Visualizer.
 * Renders node hierarchy, expand/collapse interaction, and pan-zoom behaviors.
 * Loaded sequentially after htmlSafety.js to leverage esc() and styling rules.
 */

const GRAPH_MAX_DEPTH = 4;
const GRAPH_DEFAULT_COLLAPSE_DEPTH = 2;

// Module-level D3 zoom instances accessible to toolbar controls
window._graphZoom = null;
window._graphSvg = null;
window._graphFitFn = null;
window._graphResizeObserver = null;

/** Stable hierarchical key for D3 data joins. */
function nodePathKey(d) {
  return d.ancestors().map(n => n.data.name).join('/');
}

/** Stable key for link targets. */
function linkTargetKey(d) {
  return nodePathKey(d.target);
}

/**
 * Renders an interactive D3.js hierarchical tree of dependencies.
 *
 * @param {Array<object>} packages - The filtered set of package items.
 */
window.renderGraph = function (packages) {
  const canvas = document.getElementById('graph-canvas');
  if (!canvas) return;

  if (window._graphResizeObserver) {
    window._graphResizeObserver.disconnect();
    window._graphResizeObserver = null;
  }

  canvas.innerHTML = '';
  window._graphZoom = null;
  window._graphSvg = null;
  window._graphFitFn = null;

  if (typeof d3 === 'undefined') {
    canvas.innerHTML = `<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">${window.t('graph.unavailable')}</div>`;
    return;
  }

  if (!packages.length) {
    canvas.innerHTML = `<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">${window.t('graph.noPackages')}</div>`;
    return;
  }

  try {
    const declared = sanitizePackageRequires(packages);
    const lookup = buildPkgLookup(
      sanitizePackageRequires(window.allPackages || []),
      sanitizePackageRequires(window.graphPackages || [])
    );
    const treeData = buildTreeData(declared, lookup);

    let W = canvas.clientWidth || 860;
    let H = canvas.clientHeight || 520;

    const tempRoot = d3.hierarchy(treeData);
    tempRoot.descendants().forEach(d => {
      if (d.depth > GRAPH_DEFAULT_COLLAPSE_DEPTH && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });
    const visibleLeaves = Math.max(1, tempRoot.leaves().length);
    const NODE_SEP = 26;
    const treeHeight = Math.max(H - 60, visibleLeaves * NODE_SEP);
    const DEPTH_GAP = Math.min(220, Math.max(160, (W - 120) / Math.max(3, GRAPH_MAX_DEPTH)));

    const svg = d3.select('#graph-canvas')
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${treeHeight}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.08, 4])
      .on('zoom', ev => g.attr('transform', ev.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    window._graphZoom = zoom;
    window._graphSvg = svg;

    const root = d3.hierarchy(treeData);
    root.descendants().forEach(d => {
      if (d.depth > GRAPH_DEFAULT_COLLAPSE_DEPTH && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });

    function fitView() {
      try {
        const box = g.node().getBBox();
        if (!box || box.width === 0) return;
        const viewH = Math.max(H, treeHeight);
        const pad = 40;
        const scale = Math.min(0.95, (W - pad * 2) / box.width, (viewH - pad * 2) / box.height);
        const tx = W / 2 - (box.x + box.width / 2) * scale;
        const ty = viewH / 2 - (box.y + box.height / 2) * scale;
        svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      } catch (_) {}
    }
    window._graphFitFn = fitView;

    function toggleNode(d) {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else if (d._children) {
        d.children = d._children;
        d._children = null;
      } else {
        return false;
      }
      return true;
    }

    function update() {
      const layout = d3.tree()
        .size([treeHeight - 40, W - 120])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.4));
      layout(root);

      const nodes = root.descendants();
      const links = root.links();

      const linkSel = g.selectAll('.link')
        .data(links, linkTargetKey);

      linkSel.enter().append('path')
        .attr('class', 'link')
        .merge(linkSel)
        .attr('d', d3.linkHorizontal().x(d => d.y).y(d => d.x));

      linkSel.exit().remove();

      const nodeSel = g.selectAll('.node')
        .data(nodes, nodePathKey);

      const nodeEnter = nodeSel.enter().append('g')
        .attr('transform', d => `translate(${d.y},${d.x})`);

      nodeEnter.append('circle')
        .attr('class', 'node-circle')
        .attr('r', d => d.depth === 0 ? 12 : 7);

      nodeEnter.append('text')
        .attr('class', 'node-label')
        .attr('dy', '0.32em')
        .attr('x', d => d.depth === 0 ? 18 : ((d.children || d._children) ? -12 : 12))
        .style('text-anchor', d => d.depth === 0 ? 'start' : ((d.children || d._children) ? 'end' : 'start'))
        .text(d => {
          const v = d.data.version ? ` (${d.data.version})` : '';
          return d.data.name + v;
        });

      nodeEnter.filter(d => d._children)
        .append('circle')
        .attr('class', 'expand-dot')
        .attr('r', 3)
        .attr('cx', 10).attr('cy', -10)
        .style('fill', 'var(--c-update)');

      const nodeMerge = nodeSel.merge(nodeEnter);

      nodeMerge
        .attr('class', d => {
          return [
            'node',
            d.data.status || 'unknown',
            d.depth === 0 ? 'root' : '',
            d._children ? 'collapsed' : '',
          ].filter(Boolean).join(' ');
        })
        .attr('transform', d => `translate(${d.y},${d.x})`);

      nodeMerge.select('.node-label')
        .attr('x', d => d.depth === 0 ? 18 : ((d.children || d._children) ? -12 : 12))
        .style('text-anchor', d => d.depth === 0 ? 'start' : ((d.children || d._children) ? 'end' : 'start'));

      nodeMerge.selectAll('.expand-dot').remove();
      nodeMerge.filter(d => d._children && d.depth > 0)
        .append('circle')
        .attr('class', 'expand-dot')
        .attr('r', 3).attr('cx', 10).attr('cy', -9)
        .style('fill', 'var(--c-update)').style('stroke', 'none');

      nodeMerge.select('.expand-dot')
        .style('pointer-events', 'all')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          if (toggleNode(d)) {
            update();
            setTimeout(fitView, 30);
          }
        });

      nodeMerge
        .on('click', (event, d) => {
          event.stopPropagation();
          if (d.data.pkg && typeof window.showDetail === 'function') {
            window.showDetail(d.data.pkg);
          }
        })
        .on('dblclick', (event, d) => {
          event.stopPropagation();
          if (toggleNode(d)) {
            update();
            setTimeout(fitView, 30);
          }
        });

      nodeSel.exit().remove();
    }

    update();
    setTimeout(fitView, 60);

    window._graphResizeObserver = new ResizeObserver(() => {
      W = canvas.clientWidth || W;
      H = canvas.clientHeight || H;
      svg.attr('viewBox', `0 0 ${W} ${Math.max(H - 60, root.leaves().length * NODE_SEP)}`);
      fitView();
    });
    window._graphResizeObserver.observe(canvas);

    const legend = document.createElement('div');
    legend.className = 'graph-legend';
    legend.innerHTML = `
      <div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
        color:var(--vscode-descriptionForeground);margin-bottom:4px;">${window.t('graph.legend')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-ok)"></div> ${window.t('graph.legendOk')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-update)"></div> ${window.t('graph.legendUpdate')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-vuln)"></div> ${window.t('graph.legendVuln')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-unknown)"></div> ${window.t('graph.legendUnknown')}</div>
      <div class="legend-item"><div class="legend-dot" style="border:2px dashed var(--c-missing);background:none"></div> ${window.t('graph.legendNotInstalled')}</div>
      <div style="margin-top:6px;color:var(--vscode-descriptionForeground);font-size:10px;">
        ${window.t('graph.legendSubDeps')}<br>${window.t('graph.legendClick')}
      </div>
    `;
    canvas.style.position = 'relative';
    canvas.appendChild(legend);
  } catch (err) {
    console.error('renderGraph error:', err);
    canvas.innerHTML = `<div style="padding:40px;text-align:center;color:var(--vscode-errorForeground)">${window.t('graph.error')}</div>`;
  }
};

document.getElementById('graph-fit')?.addEventListener('click', () => {
  if (window._graphFitFn) window._graphFitFn();
});
document.getElementById('graph-zoom-in')?.addEventListener('click', () => {
  if (window._graphSvg && window._graphZoom) {
    window._graphSvg.call(window._graphZoom.scaleBy, 1.4);
  }
});
document.getElementById('graph-zoom-out')?.addEventListener('click', () => {
  if (window._graphSvg && window._graphZoom) {
    window._graphSvg.call(window._graphZoom.scaleBy, 1 / 1.4);
  }
});
