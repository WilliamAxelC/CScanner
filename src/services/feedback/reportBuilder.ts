import { Platform, Share } from 'react-native';
import { GITHUB_REPO_URL } from '../updates/updateChecker';
import { redactSensitiveText } from '../diagnostics/errorLog';

export type ReportKind = 'bug' | 'feature';

export interface FeedbackReportInput {
  kind: ReportKind;
  title: string;
  description: string;
  diagnostics?: string;
}

export function validateReport(input: {
  kind: ReportKind;
  title: string;
  description: string;
}): string | null {
  if (input.title.trim().length < 4) {
    return 'Please enter a short summary title (at least 4 characters).';
  }
  if (input.description.trim().length < 12) {
    return 'Please describe the issue or feature request in more detail (at least 12 characters).';
  }
  return null;
}

export function buildReportMarkdown(input: FeedbackReportInput): string {
  const heading =
    input.kind === 'bug' ? '## Bug Report' : '## Feature Request';
  const cleanTitle = input.title.trim().slice(0, 140);
  const cleanBody = redactSensitiveText(input.description.trim().slice(0, 4000));

  const sections = [
    heading,
    `**Title:** ${cleanTitle}`,
    '',
    '### Details',
    cleanBody,
  ];

  if (input.diagnostics?.trim()) {
    sections.push(
      '',
      '### Sanitized Diagnostics',
      '```text',
      input.diagnostics.trim().slice(0, 2500),
      '```',
    );
  }

  return sections.join('\n');
}

export function buildGitHubIssueUrl(input: FeedbackReportInput): string {
  const prefix = input.kind === 'bug' ? '[Bug] ' : '[Feature] ';
  const title = `${prefix}${input.title.trim().slice(0, 120)}`;
  const labels = input.kind === 'bug' ? 'bug' : 'enhancement';
  let body = buildReportMarkdown(input);
  if (body.length > 2600) {
    body = `${body.slice(0, 2540)}\n\n[Truncated for URL limit]`;
  }
  const params = new URLSearchParams({
    title,
    labels,
    body,
  });
  return `${GITHUB_REPO_URL}/issues/new?${params.toString()}`;
}

export async function copyTextToClipboard(text: string): Promise<'copied' | 'shared' | 'failed'> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return 'copied';
      }
    } catch {
      // fall through
    }
    try {
      if (typeof document !== 'undefined') {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', 'true');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        el.remove();
        if (ok) return 'copied';
      }
    } catch {
      // fall through
    }
  }

  try {
    const res = await Share.share({ message: text });
    if (res.action === Share.dismissedAction) return 'shared';
    return 'shared';
  } catch {
    return 'failed';
  }
}
