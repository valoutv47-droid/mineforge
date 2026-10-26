import { ITEM_DEFINITIONS } from './ItemTypes';
import { BlockType } from '../blocks/BlockTypes';
import { InventorySystem, ItemStack } from './InventorySystem';
import { HUD } from './HUD';

const CATS: Array<[string, string]> = [
  ['all', 'Tout'], ['block', 'Blocs'], ['tool', 'Outils'], ['weapon', 'Armes'],
  ['armor', 'Armures'], ['food', 'Nourriture'], ['material', 'Matériaux'],
];

/** Inventaire créatif : tous les blocs et objets du jeu, avec recherche et catégories. */
export class CreativeMenu {
  isOpen = false;
  private readonly root = document.createElement('div');
  private readonly hot = document.createElement('div');
  private readonly search = document.createElement('input');
  private readonly cells: Array<{ el: HTMLElement; name: string; cat: string }> = [];
  private cat = 'all';

  constructor(private readonly inv: InventorySystem, private readonly hud: HUD) {
    this.root.id = 'creative-menu';
    this.root.style.display = 'none';
    const panel = document.createElement('div');
    panel.className = 'cm-panel';
    panel.innerHTML = '<div class="cm-title">Inventaire créatif</div>';

    const bar = document.createElement('div');
    bar.className = 'cm-bar';
    this.search.className = 'cm-search';
    this.search.placeholder = 'Rechercher un bloc…';
    this.search.addEventListener('input', () => this.filter());
    this.search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.search.blur(); });
    bar.appendChild(this.search);
    for (const [id, label] of CATS) {
      const b = document.createElement('button');
      b.className = 'cm-tab' + (id === 'all' ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        this.cat = id;
        bar.querySelectorAll('.cm-tab').forEach((t) => t.classList.remove('active'));
        b.classList.add('active');
        this.filter();
      });
      bar.appendChild(b);
    }
    panel.appendChild(bar);

    const grid = document.createElement('div');
    grid.className = 'cm-grid';
    const defs = Object.values(ITEM_DEFINITIONS).filter((d) => d && Number(d.id) !== 0 && Number(d.id) !== Number(BlockType.WATER));
    defs.sort((a, b) => a.name.localeCompare(b.name));
    for (const def of defs) {
      const el = document.createElement('div');
      el.className = 'inv-slot';
      el.title = def.name;
      const c = this.hud.getItemCanvas({ itemType: def.id, count: 1 } as ItemStack);
      if (c) el.appendChild(c);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.give(def.id, def.stackSize || 64, e.button === 2 ? 1 : undefined);
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      grid.appendChild(el);
      this.cells.push({ el, name: def.name.toLowerCase(), cat: def.category ?? (def.isBlock ? 'block' : 'material') });
    }
    panel.appendChild(grid);

    this.hot.className = 'cm-hot';
    panel.appendChild(this.hot);
    const hint = document.createElement('div');
    hint.className = 'cm-hint';
    hint.textContent = 'Clic : pile complète · Clic droit : 1 seul · Clic sur la barre du bas : retirer · E : fermer';
    panel.appendChild(hint);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);
  }

  /** Vrai quand le joueur tape dans la recherche (pour ne pas fermer le menu avec « E »). */
  isTyping(): boolean { return document.activeElement === this.search; }

  open(): void { this.isOpen = true; this.root.style.display = 'flex'; this.renderHot(); }
  close(): void { this.isOpen = false; this.root.style.display = 'none'; this.search.blur(); }

  private filter(): void {
    const q = this.search.value.trim().toLowerCase();
    for (const c of this.cells) {
      c.el.style.display = (this.cat === 'all' || c.cat === this.cat) && (!q || c.name.includes(q)) ? '' : 'none';
    }
  }

  private give(type: number, size: number, count?: number): void {
    const n = count ?? size;
    const hb = this.inv.hotbar;
    let idx = hb.findIndex((s) => s && s.itemType === type);
    if (idx >= 0) {
      hb[idx]!.count = Math.min(size, hb[idx]!.count + n);
    } else {
      idx = hb.findIndex((s) => !s);
      if (idx < 0) idx = this.hud.getSelectedSlot();
      hb[idx] = { itemType: type, count: n } as ItemStack;
    }
    this.renderHot();
  }

  private renderHot(): void {
    this.hot.innerHTML = '';
    this.inv.hotbar.forEach((stack, i) => {
      const el = document.createElement('div');
      el.className = 'inv-slot';
      if (stack) {
        const c = this.hud.getItemCanvas(stack);
        if (c) el.appendChild(c);
        if (stack.count > 1) {
          const n = document.createElement('span');
          n.className = 'inv-count';
          n.textContent = String(stack.count);
          el.appendChild(n);
        }
      }
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.inv.hotbar[i] = null; this.renderHot(); });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      this.hot.appendChild(el);
    });
  }
}
