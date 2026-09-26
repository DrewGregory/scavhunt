import {
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Select,
  Switch,
} from "@chakra-ui/react";
import type { ReactNode } from "react";

type NumProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  help?: ReactNode;
  isDisabled?: boolean;
};

export function NumField({ label, value, onChange, min, max, step = 1, precision, help, isDisabled }: NumProps) {
  return (
    <FormControl size="sm" isDisabled={isDisabled}>
      <FormLabel fontSize="sm" mb={1}>
        {label}
      </FormLabel>
      <NumberInput
        size="sm"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        precision={precision}
        onChange={(_s, n) => {
          if (Number.isFinite(n)) onChange(n);
        }}
      >
        <NumberInputField />
        <NumberInputStepper>
          <NumberIncrementStepper />
          <NumberDecrementStepper />
        </NumberInputStepper>
      </NumberInput>
      {help && <FormHelperText fontSize="xs">{help}</FormHelperText>}
    </FormControl>
  );
}

/** Number field with an "off" checkbox mapping to null. */
export function NullableNumField(
  props: Omit<NumProps, "value" | "onChange"> & {
    value: number | null;
    onChange: (v: number | null) => void;
    nullLabel: string;
    defaultValue: number;
  },
) {
  const { value, onChange, nullLabel, defaultValue, ...rest } = props;
  return (
    <FormControl size="sm">
      <NumField {...rest} value={value ?? defaultValue} onChange={onChange} isDisabled={value == null} />
      <Checkbox
        size="sm"
        mt={1}
        isChecked={value == null}
        onChange={(e) => onChange(e.target.checked ? null : defaultValue)}
      >
        {nullLabel}
      </Checkbox>
    </FormControl>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
  help?: ReactNode;
}) {
  return (
    <FormControl size="sm">
      <FormLabel fontSize="sm" mb={1}>
        {label}
      </FormLabel>
      <Select size="sm" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </Select>
      {help && <FormHelperText fontSize="xs">{help}</FormHelperText>}
    </FormControl>
  );
}

export function SwitchField({
  label,
  isChecked,
  onChange,
}: {
  label: string;
  isChecked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <FormControl display="flex" alignItems="center">
      <HStack>
        <Switch size="sm" isChecked={isChecked} onChange={(e) => onChange(e.target.checked)} />
        <FormLabel fontSize="sm" mb={0}>
          {label}
        </FormLabel>
      </HStack>
    </FormControl>
  );
}
