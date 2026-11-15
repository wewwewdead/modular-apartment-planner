// Shop → Job sheet (docs/sketch-studio-fab-shop.md §9 SM-4): per product the
// route Cut → Bend → Paint → Print with what was done at each step, the
// quantities, the estimated times per step and in total, and a marker of
// what is done; what is in the product but not made here; a batch quantity;
// the CSV. Everything is jobSheet.js.
import { BEND_HANDLING_S, JOB_STATUS_NAMES, PRINT_HANDLING_S, formatDuration, stockSheetLabel } from './jobSheet.js';
import NumericInput from '../components/NumericInput.jsx';

const MARKS = { done: '✓', partial: '◐', todo: '○', none: '–' };

/**
 * `sheet`: jobSheet(); `productId`: the product shown (null: all). Callbacks:
 * onProduct(id | null), onBatch(n), onCsv().
 */
export default function JobSheetPanel({ sheet, productId = null, onProduct, onBatch, onCsv, stale = false }) {
  const shown = productId ? sheet.products.filter((p) => p.id === productId) : sheet.products;
  return (
    <section className="cad-shop-panel cad-job-sheet" aria-label="Job sheet">
      <h3>Job sheet</h3>
      <p className="cad-help">
        The shop route of each product (a group or a lone part): what was done at each step and how long it takes. Times
        are estimates from the stations&apos; readouts, on the {sheet.machine}.
      </p>
      {!sheet.products.length && <p className="cad-help">No parts yet: Shop → Cut from sheet makes the first blank.</p>}
      {sheet.products.length > 1 && (
        <label className="cad-field">
          Product
          <select aria-label="Product" value={productId || ''} onChange={(e) => onProduct(e.target.value || null)}>
            <option value="">Every product</option>
            {sheet.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="cad-field">
        Batch (products to make)
        <NumericInput
          aria-label="Batch"
          min="1"
          step="1"
          value={sheet.batch}
          onCommit={(v) => onBatch(Math.max(1, Math.round(v) || 1))}
        />
      </label>
      {stale && (
        <p className="cad-help" role="note">
          The solids are rebuilding: painted areas follow once the model is current.
        </p>
      )}
      {shown.map((product) => (
        <article className="cad-job-product" key={product.id} aria-label={`Product ${product.name}`}>
          <header>
            <strong>{product.name}</strong>
            <span className={`cad-job-status is-${product.done ? 'done' : 'todo'}`} aria-label="Route status">
              {product.done ? 'All steps done' : 'Steps still to do'}
            </span>
          </header>
          <ol className="cad-job-steps" aria-label={`${product.name} route`}>
            {product.steps.map((step) => (
              <li key={step.key} className={`is-${step.status}`} aria-label={`${step.name} step`}>
                <div className="cad-job-step">
                  <span className="cad-job-mark" aria-hidden="true">
                    {MARKS[step.status]}
                  </span>
                  <strong>{step.name}</strong>
                  <span className="cad-job-state" aria-label={`${step.name} status`}>
                    {JOB_STATUS_NAMES[step.status]}
                  </span>
                  <span className="cad-job-time" aria-label={`${step.name} time`}>
                    {step.items.length ? `${step.quantity} · est. ${formatDuration(step.time)}` : '—'}
                  </span>
                </div>
                <p className="cad-help">{step.summary}</p>
                {step.items.length > 0 && (
                  <ul className="cad-job-items">
                    {step.items.map((item, i) => (
                      <li key={`${step.key}-${i}`}>
                        <span>
                          <b>{item.label}</b> · {item.detail}
                        </span>
                        <span className="cad-job-time">
                          {item.quantity > 1 ? `${item.quantity} × ` : ''}
                          {item.seconds != null ? formatDuration(item.seconds) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {product.notMade.length > 0 && (
            <p className="cad-help" aria-label={`${product.name} not made here`}>
              Not made here (not timed): {product.notMade.map((item) => `${item.count} × ${item.label}`).join(', ')}
            </p>
          )}
          <p className="cad-part-size" aria-label={`${product.name} total`}>
            Total {formatDuration(product.time)} (estimated
            {sheet.batch > 1 ? `, batch of ${sheet.batch}` : ''})
          </p>
        </article>
      ))}
      {sheet.stockSheets?.length > 0 && (
        // Sheets to buy (docs/sketch-studio-outline-edit-sheet-nest.md §7.5): every blank
        // of one stock and thickness nested as the laser nests it, for the batch.
        <section className="cad-job-stock" aria-label="Sheets to buy">
          <h4>Sheets to buy</h4>
          {sheet.batch > 1 && (
            <p className="cad-help">
              For the batch of {sheet.batch}: every blank made {sheet.batch} times.
            </p>
          )}
          <ul className="cad-job-items">
            {sheet.stockSheets.map((s) => (
              <li key={`${s.stock}-${s.thickness}`} aria-label={stockSheetLabel(s)}>
                <span>
                  <b>{stockSheetLabel(s)}</b> · {s.blanks} blank{s.blanks === 1 ? '' : 's'}
                  {s.oversize ? ` · ${s.oversize} larger than the sheet` : ''}
                </span>
                {/* The laser station's Sheet use, word for word: "{use}% · {n} sheet(s)". */}
                <span className="cad-job-time" aria-label="Sheet use">
                  {Number((s.use * 100).toFixed(1))}% · {s.sheets} sheet{s.sheets === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="cad-help">
        Estimates: laser time from the cut length, pierces and cutting speed; each press brake hit its stroke plus{' '}
        {BEND_HANDLING_S} s handling; paint the oven cure only; each print {PRINT_HANDLING_S} s. Welding and assembly
        are not counted, nor are rapid moves, set-ups and transport.
      </p>
      <button type="button" className="cad-wide" disabled={!sheet.products.length} onClick={onCsv}>
        Download job sheet CSV
      </button>
    </section>
  );
}
