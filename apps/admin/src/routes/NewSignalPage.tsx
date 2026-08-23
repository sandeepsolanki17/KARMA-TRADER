import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateSignal } from '../lib/queries';
import type { CreateSignalDraftInput } from '@karma/types';

const EXCHANGES = ['NSE', 'BSE', 'NFO', 'MCX'];

export function NewSignalPage() {
  const navigate = useNavigate();
  const createSignal = useCreateSignal();

  const [form, setForm] = useState({
    side: 'BUY' as 'BUY' | 'SELL',
    instrumentDisplayName: '',
    entry: '',
    stopLoss: '',
    target1: '',
    target2: '',
    target3: '',
    exchange: 'NFO',
    tradingSymbol: '',
    productType: 'INTRADAY',
    quantity: '',
    notes: '',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: CreateSignalDraftInput = {
      side: form.side,
      instrumentDisplayName: form.instrumentDisplayName,
      tradePlan: {
        entry: Number(form.entry),
        stopLoss: Number(form.stopLoss),
        target1: Number(form.target1),
        target2: form.target2 ? Number(form.target2) : null,
        target3: form.target3 ? Number(form.target3) : null,
        partialExitPercentages: null,
      },
      brokerOrderHint: {
        broker: 'ANGEL_ONE',
        exchange: form.exchange,
        tradingSymbol: form.tradingSymbol,
        symbolToken: null,
        side: form.side,
        orderType: 'LIMIT',
        productType: form.productType || null,
        quantity: form.quantity ? Number(form.quantity) : null,
      },
      notes: form.notes || null,
    };
    const result = await createSignal.mutateAsync(input);
    navigate(`/signals/${result.signal.id}`);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-xl font-semibold mb-5">New Signal</h1>
      <form onSubmit={handleSubmit} className="glass p-6 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Side</label>
            <select className="input" value={form.side} onChange={set('side')}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div>
            <label className="label">Instrument display name</label>
            <input
              className="input"
              required
              placeholder="NIFTY 24 SEP 22000 CE"
              value={form.instrumentDisplayName}
              onChange={set('instrumentDisplayName')}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label">Entry</label>
            <input className="input figure" required type="number" step="0.01" value={form.entry} onChange={set('entry')} />
          </div>
          <div>
            <label className="label">Stop loss</label>
            <input className="input figure" required type="number" step="0.01" value={form.stopLoss} onChange={set('stopLoss')} />
          </div>
          <div>
            <label className="label">Target 1</label>
            <input className="input figure" required type="number" step="0.01" value={form.target1} onChange={set('target1')} />
          </div>
          <div>
            <label className="label">Target 2</label>
            <input className="input figure" type="number" step="0.01" value={form.target2} onChange={set('target2')} />
          </div>
        </div>

        <div className="eyebrow border-t border-white/[0.06] pt-4">Angel One order hint</div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label">Exchange</label>
            <select className="input" value={form.exchange} onChange={set('exchange')}>
              {EXCHANGES.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Trading symbol</label>
            <input
              className="input figure"
              required
              placeholder="NIFTY24SEP22000CE"
              value={form.tradingSymbol}
              onChange={set('tradingSymbol')}
            />
          </div>
          <div>
            <label className="label">Quantity</label>
            <input className="input figure" type="number" value={form.quantity} onChange={set('quantity')} />
          </div>
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={3} value={form.notes} onChange={set('notes')} />
        </div>

        {createSignal.isError && (
          <div className="text-sm text-sell bg-sell/10 border border-sell/20 rounded-xl px-3 py-2">
            {(createSignal.error as any)?.message ?? 'Failed to create signal.'}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="submit" className="btn-primary" disabled={createSignal.isPending}>
            {createSignal.isPending ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
