import { buildActivityReportHtml } from '@/lib/activity-report';

describe('buildActivityReportHtml', () => {
  const base = { groupName: 'Tontine du quartier', generatedAt: '26 septembre 2026 à 21:40' };

  it('liste chaque entrée avec sa date', () => {
    const html = buildActivityReportHtml({
      ...base,
      lines: [
        { when: '26 sept. 2026, 14:32', sentence: 'Awa a ajouté Tontine, 5 000 XAF du 26 sept.' },
        { when: '25 sept. 2026, 09:05', sentence: 'Bintou a rejoint le groupe' },
      ],
    });
    expect(html).toContain('Tontine du quartier');
    expect(html).toContain('2 entrées');
    expect(html).toContain('Bintou a rejoint le groupe');
    expect(html).toContain('26 sept. 2026, 14:32');
  });

  it('échappe ce qu’un membre a saisi', () => {
    const html = buildActivityReportHtml({
      ...base,
      groupName: '<b>Coloc</b>',
      lines: [{ when: 'x', sentence: 'Awa a ajouté « <img src=x onerror=alert(1)> »' }],
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;b&gt;Coloc');
  });

  it('dit quand il n’y a rien', () => {
    expect(buildActivityReportHtml({ ...base, lines: [] })).toContain('Aucune activité.');
  });
});
