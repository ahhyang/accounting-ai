export type PostingLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string;
};

export type CreateJournalInput = {
  companyId: string;
  journalDate: string;
  journalNumber: string;
  description?: string;
  sourceDocumentId?: string;
  lines: PostingLineInput[];
};
