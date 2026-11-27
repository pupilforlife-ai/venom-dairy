import { describe, expect, it, vi } from 'vitest';
import { create } from 'react-test-renderer';
import { createElement } from 'react';
import AppErrorBoundary from './AppErrorBoundary';

describe('AppErrorBoundary', () => {
  it('shows a recovery action when a view crashes instead of rendering blank', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const BrokenView = () => { throw new Error('Render failed after save'); };
    try {
      const tree = create(createElement(AppErrorBoundary, null, createElement(BrokenView)));
      const alert = tree.root.findByProps({ role: 'alert' });
      expect(alert.findAllByType('button')).toHaveLength(1);
      expect(JSON.stringify(tree.toJSON())).toContain('check the round before recording it again');
      expect(JSON.stringify(tree.toJSON())).toContain('Render failed after save');
    } finally {
      logged.mockRestore();
    }
  });
});
