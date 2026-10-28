import { useState } from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '@/components/ui/alert-dialog';

afterEach(cleanup);
function Example({ alert = false, custom = false }: { alert?: boolean; custom?: boolean }) {
  const [open, setOpen] = useState(false);
  const closePolicy = custom ? (event: Event) => {
    event.preventDefault();
    document.getElementById('other-destination')?.focus();
  } : undefined;
  return <>
    <button onClick={() => setOpen(true)}>Open test dialog</button>
    <button id="other-destination">Custom destination</button>
    {alert ? <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent onCloseAutoFocus={closePolicy}>
        <AlertDialogTitle>Confirm test</AlertDialogTitle>
        <AlertDialogDescription>No data is changed.</AlertDialogDescription>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog> : <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onCloseAutoFocus={closePolicy}>
        <DialogTitle>Test details</DialogTitle>
        <DialogDescription>No data is changed.</DialogDescription>
        <input aria-label="Test value" />
      </DialogContent>
    </Dialog>}
  </>;
}
describe('controlled dialog return focus without a Trigger', () => {
  it('retains native Radix Trigger restoration when opening did not focus the button', async () => {
    const user = userEvent.setup();
    render(<Dialog><DialogTrigger>Open triggered dialog</DialogTrigger>
      <DialogContent><DialogTitle>Triggered dialog</DialogTitle>
        <DialogDescription>No data is changed.</DialogDescription></DialogContent>
    </Dialog>);
    const opener = screen.getByRole('button', { name: 'Open triggered dialog' });
    // Unlike keyboard activation, a touch-style click need not focus its target.
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });
  it.each([false, true])('restores the connected opener after Escape (alert=%s)', async alert => {
    const user = userEvent.setup();
    render(<Example alert={alert} />);
    const opener = screen.getByRole('button', { name: 'Open test dialog' });
    await user.click(opener);
    expect(screen.getByRole(alert ? 'alertdialog' : 'dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });
  it('preserves explicit consumer close-focus policy for editor selections', async () => {
    const user = userEvent.setup();
    render(<Example custom />);
    await user.click(screen.getByRole('button', { name: 'Open test dialog' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Custom destination' })).toHaveFocus());
  });
});
