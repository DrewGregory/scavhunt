import assert from "assert";
import { isValid, parseISO } from "date-fns";

export const getStartTime = () => {
  const startTimeISO = process.env.START_TIME_ISO_STRING;
  assert(startTimeISO != null);
  const startTime = parseISO(startTimeISO);
  assert(isValid(startTime));
  return startTime;
};

export const getEndTime = () => {
  const endTimeISO = process.env.END_TIME_ISO_STRING;
  assert(endTimeISO != null);
  const endTime = parseISO(endTimeISO);
  assert(isValid(endTime));
  return endTime;
};