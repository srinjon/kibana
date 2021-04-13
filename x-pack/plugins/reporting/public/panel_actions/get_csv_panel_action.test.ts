/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import { first } from 'rxjs/operators';
import { LicensingPluginSetup } from '../../../licensing/public';
import { GetCsvReportPanelAction } from './get_csv_panel_action';

type LicenseResults = 'valid' | 'invalid' | 'unavailable' | 'expired';

describe('GetCsvReportPanelAction', () => {
  let core: any;
  let context: any;
  let mockLicense$: any;
  let mockSearchSource: any;

  beforeAll(() => {
    if (typeof window.URL.revokeObjectURL === 'undefined') {
      Object.defineProperty(window.URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }
  });

  beforeEach(() => {
    mockLicense$ = (state: LicenseResults = 'valid') => {
      return (of({
        check: jest.fn().mockImplementation(() => ({ state })),
      }) as unknown) as LicensingPluginSetup['license$'];
    };

    core = {
      http: {
        post: jest.fn().mockImplementation(() => Promise.resolve(true)),
      },
      notifications: {
        toasts: {
          addSuccess: jest.fn(),
          addDanger: jest.fn(),
        },
      },
      uiSettings: {
        get: () => 'Browser',
      },
    } as any;

    mockSearchSource = {
      createCopy: () => mockSearchSource,
      removeField: jest.fn(),
      setField: jest.fn(),
      getField: jest.fn(),
      getSerializedFields: jest.fn().mockImplementation(() => ({})),
    };

    context = {
      embeddable: {
        type: 'search',
        getSavedSearch: () => {
          return { searchSource: mockSearchSource };
        },
        getTitle: () => `The Dude`,
        getInspectorAdapters: () => null,
        getInput: () => ({
          viewMode: 'list',
          timeRange: {
            to: 'now',
            from: 'now-7d',
          },
        }),
      },
    } as any;
  });

  it('translates empty embeddable context into job params', async () => {
    const panel = new GetCsvReportPanelAction(core, mockLicense$());

    await panel.execute(context);

    expect(core.http.post).toHaveBeenCalledWith(
      '/api/reporting/v1/generate/immediate/csv_searchsource',
      {
        body: '{"searchSource":{},"columns":[],"browserTimezone":"America/New_York"}',
      }
    );
  });

  it('translates embeddable context into job params', async () => {
    // setup
    mockSearchSource = {
      createCopy: () => mockSearchSource,
      removeField: jest.fn(),
      setField: jest.fn(),
      getField: jest.fn(),
      getSerializedFields: jest.fn().mockImplementation(() => ({ testData: 'testDataValue' })),
    };
    context.embeddable.getSavedSearch = () => {
      return {
        searchSource: mockSearchSource,
        columns: ['column_a', 'column_b'],
      };
    };

    const panel = new GetCsvReportPanelAction(core, mockLicense$());

    // test
    await panel.execute(context);

    expect(core.http.post).toHaveBeenCalledWith(
      '/api/reporting/v1/generate/immediate/csv_searchsource',
      {
        body:
          '{"searchSource":{"testData":"testDataValue"},"columns":["column_a","column_b"],"browserTimezone":"America/New_York"}',
      }
    );
  });

  it('allows downloading for valid licenses', async () => {
    const panel = new GetCsvReportPanelAction(core, mockLicense$());

    await panel.execute(context);

    expect(core.http.post).toHaveBeenCalled();
  });

  it('shows a good old toastie when it successfully starts', async () => {
    const panel = new GetCsvReportPanelAction(core, mockLicense$());

    await panel.execute(context);

    expect(core.notifications.toasts.addSuccess).toHaveBeenCalled();
    expect(core.notifications.toasts.addDanger).not.toHaveBeenCalled();
  });

  it('shows a bad old toastie when it successfully fails', async () => {
    const coreFails = {
      ...core,
      http: {
        post: jest.fn().mockImplementation(() => Promise.reject('No more ram!')),
      },
    };
    const panel = new GetCsvReportPanelAction(coreFails, mockLicense$());

    await panel.execute(context);

    expect(core.notifications.toasts.addDanger).toHaveBeenCalled();
  });

  it(`doesn't allow downloads with bad licenses`, async () => {
    const licenseMock = mockLicense$('invalid');
    const plugin = new GetCsvReportPanelAction(core, licenseMock);
    await licenseMock.pipe(first()).toPromise();
    expect(await plugin.isCompatible(context)).toEqual(false);
  });

  it('sets a display and icon type', () => {
    const panel = new GetCsvReportPanelAction(core, mockLicense$());
    expect(panel.getIconType()).toMatchInlineSnapshot(`"document"`);
    expect(panel.getDisplayName()).toMatchInlineSnapshot(`"Download CSV"`);
  });
});
