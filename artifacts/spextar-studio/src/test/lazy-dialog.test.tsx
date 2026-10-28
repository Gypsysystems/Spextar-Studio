import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState, type ComponentType } from 'react';
import { createLazyDialog } from '@/components/lazy-dialog';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string }
function Form({ open, onOpenChange, workspaceId }: Props) {
  const [value, setValue] = useState('');
  return open ? <div aria-label="Loaded form">
    <label>Workspace <input value={value} onChange={event => setValue(event.target.value)} /></label>
    <p>{workspaceId}</p><button onClick={() => onOpenChange(false)}>Finish</button>
  </div> : null;
}

describe('on-demand creation dialogs', () => {
  it('does not download a closed form and forwards its props and close action after loading', async () => {
    const user = userEvent.setup();
    let finish!: (module: { default: ComponentType<Props> }) => void;
    const load = vi.fn(() => new Promise<{ default: ComponentType<Props> }>(resolve => { finish = resolve; }));
    const Lazy = createLazyDialog('Create project', load);
    const close = vi.fn();
    const view = render(<Lazy workspaceId="workspace-a" open={false} onOpenChange={close} />);
    expect(load).not.toHaveBeenCalled();
    view.rerender(<Lazy workspaceId="workspace-a" open onOpenChange={close} />);
    expect(screen.getByRole('status')).toHaveTextContent('Please wait');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Create project');
    await act(async () => finish({ default: Form }));
    expect(screen.getByText('workspace-a')).toBeVisible();
    await user.type(screen.getByLabelText('Workspace'), 'Retained');
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(close).toHaveBeenCalledWith(false);
    view.rerender(<Lazy workspaceId="workspace-a" open={false} onOpenChange={close} />);
    view.rerender(<Lazy workspaceId="workspace-a" open onOpenChange={close} />);
    expect(screen.getByLabelText('Workspace')).toHaveValue('Retained');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('allows keyboard dismissal while a download is pending', async () => {
    const close = vi.fn();
    const Lazy = createLazyDialog<Props>('Create workspace', () => new Promise(() => {}));
    render(<Lazy workspaceId="workspace-a" open onOpenChange={close} />);
    await userEvent.setup().keyboard('{Escape}');
    expect(close).toHaveBeenCalledWith(false);
  });

  it('contains download failures with explicit reload and safe close rather than retrying a cached import', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn(async () => { throw new Error('test download rejected'); });
    const Lazy = createLazyDialog<Props>('Create workspace', load);
    const close = vi.fn();
    const view = render(<Lazy workspaceId="workspace-a" open onOpenChange={close} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No changes were made');
    expect(screen.getByRole('button', { name: 'Reload Studio' })).toBeEnabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledWith(false);
    view.rerender(<Lazy workspaceId="workspace-a" open={false} onOpenChange={close} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.rerender(<Lazy workspaceId="workspace-a" open onOpenChange={close} />);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
