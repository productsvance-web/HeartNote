// A paired sys + dia reading. One BpPair = one BP measurement event.
// Built on the server by joining daily_log_readings rows on source_log_id.

export type BpPair = {
  sourceLogId: string;
  // ids of the underlying readings, used for delete-by-pair.
  sysId: string;
  diaId: string;
  sys: number;
  dia: number;
  recorded_at: string;
  log_date: string;
};
