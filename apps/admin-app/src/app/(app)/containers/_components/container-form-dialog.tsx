"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { ContainerSizeFt, ContainerType } from "@repo/shipping";
import {
  CONTAINER_CONDITIONS,
  CONTAINER_SIZES_FT,
  CONTAINER_STATUSES,
  CONTAINER_TYPES,
  REEFER_TYPE,
  TYPICAL_PLATE,
  typicalCapacityM3,
} from "@repo/shipping";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import type { ContainerFormInput, ContainerFormValues } from "../_lib/schemas";
import type {
  Container,
  CreateContainerPayload,
  UpdateContainerPayload,
} from "~/services/containers/types";
import { useCan } from "~/components/providers/ability-provider";
import { getApiErrorMessage, isConflict } from "~/lib/axios";
import { useCreateContainer } from "~/services/containers/use-create-container";
import { useUpdateContainer } from "~/services/containers/use-update-container";
import { useUsers } from "~/services/users/use-users";
import { createContainerFormSchema } from "../_lib/schemas";

/** Every console account fits in one select; there is no paging inside a dialog. */
const ASSIGNEE_LIMIT = 100;

/** The assignee select's "nobody" option — a Radix Select cannot hold an empty value. */
const NOBODY = "none";

interface ContainerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The container being edited; absent means this is a create. */
  container?: Container | null;
}

/** The empty form, and the shape every reset goes through. */
function emptyValues(): ContainerFormInput {
  return {
    containerNumber: "",
    type: "dry",
    sizeFt: "20",
    status: "available",
    condition: "cargo_worthy",
    tareWeightKg: String(TYPICAL_PLATE[20].tareWeightKg),
    maxGrossWeightKg: String(TYPICAL_PLATE[20].maxGrossWeightKg),
    isoTypeCode: "",
    cubicCapacityM3: String(typicalCapacityM3(20, "dry")),
    operator: "",
    unlocode: "",
    depot: "",
    manufacturedOn: "",
    nextInspectionOn: "",
    reeferSetpointC: "",
    notes: "",
    assignedToId: NOBODY,
  };
}

/**
 * One dialog for both create and edit.
 *
 * A container has more fields than fit a comfortable form, so they are grouped the way the
 * information reaches an operator: the identity is stamped on the door, the two weights come
 * off the CSC plate, and the rest is where the box is and who is looking after it.
 */
export function ContainerFormDialog({ open, onOpenChange, container }: ContainerFormDialogProps) {
  const t = useTranslations("Containers.form");
  const tv = useTranslations("Containers.validation");
  const tt = useTranslations("Containers.type");
  const tsx = useTranslations("Containers.status");
  const tcond = useTranslations("Containers.condition");
  const tc = useTranslations("Containers");
  const format = useFormatter();

  const isEdit = Boolean(container);
  const createContainer = useCreateContainer();
  const updateContainer = useUpdateContainer();

  // Only offered to someone who may see accounts; anyone else creates the box and leaves the
  // assignment to an operator who can.
  const canReadUsers = useCan("read", "User");
  const assignees = useUsers({ skip: 0, take: ASSIGNEE_LIMIT });

  // Rebuilt when the language changes so validation errors are translated too.
  const schema = useMemo(
    () =>
      createContainerFormSchema({
        numberInvalid: tv("numberInvalid"),
        isoTypeCode: tv("isoTypeCode"),
        unlocode: tv("unlocode"),
        tareRange: tv("tareRange"),
        grossRange: tv("grossRange"),
        payloadPositive: tv("payloadPositive"),
        capacityRange: tv("capacityRange"),
        setpointRange: tv("setpointRange"),
        setpointReeferOnly: tv("setpointReeferOnly"),
        operatorMax: tv("operatorMax"),
        depotMax: tv("depotMax"),
        notesMax: tv("notesMax"),
        dateInvalid: tv("dateInvalid"),
      }),
    [tv],
  );

  /**
   * Three generics, not one: the schema *transforms* — every input is a string from the DOM,
   * and what comes out is numbers with the blanks dropped. Declaring the transformed type as
   * well is what makes `handleSubmit` hand the parsed values to the submit handler.
   *
   * Getting this wrong is quiet rather than loud. With only the input type declared, the
   * handler still receives the parsed values while *claiming* to receive strings, and
   * re-parsing them there throws inside the submit — no error, no toast, just a dialog that
   * will not close.
   */
  const form = useForm<ContainerFormInput, unknown, ContainerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(),
  });

  /**
   * Whether the plate fields are still following the size and type.
   *
   * A new box gets typical figures as a starting point, because an operator is copying from a
   * plate and "2,200" is more useful than an empty field. The moment they type their own, the
   * link breaks — regenerating on every size change would silently overwrite a real weight.
   */
  const [isPlateLinked, setPlateLinked] = useState(!isEdit);

  const type = form.watch("type");
  const tare = Number(form.watch("tareWeightKg"));
  const gross = Number(form.watch("maxGrossWeightKg"));
  const payload = Number.isFinite(gross - tare) ? gross - tare : 0;

  // The dialog is mounted once and reused, so the fields have to be re-seeded whenever it
  // opens — otherwise it would show whichever box was edited last.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;

    if (!container) {
      reset(emptyValues());
      setPlateLinked(true);
      return;
    }

    reset({
      containerNumber: container.containerNumber,
      type: container.type,
      sizeFt: String(container.sizeFt),
      status: container.status,
      condition: container.condition,
      tareWeightKg: String(container.tareWeightKg),
      maxGrossWeightKg: String(container.maxGrossWeightKg),
      isoTypeCode: container.isoTypeCode ?? "",
      cubicCapacityM3: container.cubicCapacityM3 === null ? "" : String(container.cubicCapacityM3),
      operator: container.operator ?? "",
      unlocode: container.unlocode ?? "",
      depot: container.depot ?? "",
      manufacturedOn: container.manufacturedOn ?? "",
      nextInspectionOn: container.nextInspectionOn ?? "",
      reeferSetpointC: container.reeferSetpointC === null ? "" : String(container.reeferSetpointC),
      notes: container.notes ?? "",
      assignedToId: container.assignedTo?.id ?? NOBODY,
    });
    setPlateLinked(false);
  }, [open, container, reset]);

  /** Applies the typical plate for a size/type pair, while the fields are still linked. */
  function applyTypicalPlate(nextSize: ContainerSizeFt, nextType: ContainerType) {
    if (!isPlateLinked) return;
    const plate = TYPICAL_PLATE[nextSize];
    form.setValue("tareWeightKg", String(plate.tareWeightKg));
    form.setValue("maxGrossWeightKg", String(plate.maxGrossWeightKg));
    form.setValue("cubicCapacityM3", String(typicalCapacityM3(nextSize, nextType)));
  }

  async function onSubmit(values: ContainerFormValues) {
    const assignedToId = values.assignedToId === NOBODY ? undefined : values.assignedToId;

    try {
      if (container) {
        // Only what actually changed. A PATCH that echoed every field would move `updated_at`
        // on a save that changed nothing, and `null` is how a field is cleared — so an
        // emptied input has to become `null` rather than `undefined`.
        const payloadPatch: UpdateContainerPayload = {};
        const set = <K extends keyof UpdateContainerPayload>(
          key: K,
          next: UpdateContainerPayload[K],
          current: unknown,
        ) => {
          if (next !== current) payloadPatch[key] = next;
        };

        set("containerNumber", values.containerNumber, container.containerNumber);
        set("type", values.type, container.type);
        set("sizeFt", values.sizeFt, container.sizeFt);
        set("status", values.status, container.status);
        set("condition", values.condition, container.condition);
        set("tareWeightKg", values.tareWeightKg, container.tareWeightKg);
        set("maxGrossWeightKg", values.maxGrossWeightKg, container.maxGrossWeightKg);
        set("isoTypeCode", values.isoTypeCode ?? null, container.isoTypeCode);
        set("cubicCapacityM3", values.cubicCapacityM3 ?? null, container.cubicCapacityM3);
        set("operator", values.operator ?? null, container.operator);
        set("unlocode", values.unlocode ?? null, container.unlocode);
        set("depot", values.depot ?? null, container.depot);
        set("manufacturedOn", values.manufacturedOn ?? null, container.manufacturedOn);
        set("nextInspectionOn", values.nextInspectionOn ?? null, container.nextInspectionOn);
        set("reeferSetpointC", values.reeferSetpointC ?? null, container.reeferSetpointC);
        set("notes", values.notes ?? null, container.notes);
        set("assignedToId", assignedToId ?? null, container.assignedTo?.id ?? null);

        const updated = await updateContainer.mutateAsync({
          id: container.id,
          payload: payloadPatch,
        });
        toast.success(t("editSuccess", { number: updated.containerNumber }));
      } else {
        const created = await createContainer.mutateAsync({
          containerNumber: values.containerNumber,
          type: values.type,
          sizeFt: values.sizeFt,
          status: values.status,
          condition: values.condition,
          tareWeightKg: values.tareWeightKg,
          maxGrossWeightKg: values.maxGrossWeightKg,
          isoTypeCode: values.isoTypeCode,
          cubicCapacityM3: values.cubicCapacityM3,
          operator: values.operator,
          unlocode: values.unlocode,
          depot: values.depot,
          manufacturedOn: values.manufacturedOn,
          nextInspectionOn: values.nextInspectionOn,
          reeferSetpointC: values.reeferSetpointC,
          notes: values.notes,
          assignedToId,
        } satisfies CreateContainerPayload);
        toast.success(t("createSuccess", { number: created.containerNumber }));
      }

      onOpenChange(false);
    } catch (error) {
      if (isConflict(error)) {
        // The only uniqueness constraint on this form is the number, so put the message on
        // that field rather than in a toast the operator has to translate back into "which
        // box do I fix?".
        form.setError("containerNumber", { message: t("numberTaken") });
        return;
      }
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Tall on purpose and scrolled inside: a container has more fields than a viewport,
          and a dialog that grows past the screen puts its submit button out of reach. */}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <section className="space-y-4">
              <h3 className="text-sm font-medium">{t("sections.identity")}</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="containerNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("number")}</FormLabel>
                      <FormControl>
                        {/* An identifier, so it stays LTR and monospaced even in a
                            right-to-left layout — the label beside it still flips. */}
                        <Input
                          dir="ltr"
                          className="font-mono"
                          placeholder="MSCU1234565"
                          autoComplete="off"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t("numberHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isoTypeCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("isoTypeCode")}</FormLabel>
                      <FormControl>
                        <Input dir="ltr" className="font-mono" placeholder="22G1" {...field} />
                      </FormControl>
                      <FormDescription>{t("isoTypeCodeHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("type")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          applyTypicalPlate(
                            Number(form.getValues("sizeFt")) as ContainerSizeFt,
                            value as ContainerType,
                          );
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONTAINER_TYPES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {tt(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sizeFt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("size")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          applyTypicalPlate(
                            Number(value) as ContainerSizeFt,
                            form.getValues("type") as ContainerType,
                          );
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONTAINER_SIZES_FT.map((value) => (
                            <SelectItem key={value} value={String(value)}>
                              {tc("sizeFeet", { size: value })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-medium">{t("sections.plate")}</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="tareWeightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tare")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          dir="ltr"
                          inputMode="numeric"
                          {...field}
                          onChange={(event) => {
                            setPlateLinked(false);
                            field.onChange(event);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxGrossWeightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("maxGross")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          dir="ltr"
                          inputMode="numeric"
                          {...field}
                          onChange={(event) => {
                            setPlateLinked(false);
                            field.onChange(event);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cubicCapacityM3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("capacity")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" dir="ltr" inputMode="decimal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* The payload is the difference, and the API derives it the same way — shown
                  live so a transposed digit is visible before the save rather than after. */}
              <p className="text-muted-foreground text-sm">
                {t("payloadPreview", { weight: format.number(payload) })}
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-medium">{t("sections.operations")}</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("status")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONTAINER_STATUSES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {tsx(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("condition")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONTAINER_CONDITIONS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {tcond(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="operator"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("operator")}</FormLabel>
                      <FormControl>
                        <Input placeholder="MSC" {...field} />
                      </FormControl>
                      <FormDescription>{t("operatorHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unlocode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("unlocode")}</FormLabel>
                      <FormControl>
                        <Input dir="ltr" className="font-mono" placeholder="EGALY" {...field} />
                      </FormControl>
                      <FormDescription>{t("unlocodeHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="depot"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("depot")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("depotPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="manufacturedOn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("manufacturedOn")}</FormLabel>
                      <FormControl>
                        <Input type="date" dir="ltr" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nextInspectionOn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("nextInspectionOn")}</FormLabel>
                      <FormControl>
                        <Input type="date" dir="ltr" {...field} />
                      </FormControl>
                      <FormDescription>{t("nextInspectionHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Only rendered for a reefer: the API refuses a setpoint on anything else, so
                    offering the field would be offering a value that cannot be saved. */}
                {type === REEFER_TYPE ? (
                  <FormField
                    control={form.control}
                    name="reeferSetpointC"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("setpoint")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            dir="ltr"
                            inputMode="decimal"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>{t("setpointHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                {canReadUsers ? (
                  <FormField
                    control={form.control}
                    name="assignedToId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("assignedTo")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NOBODY}>{t("nobody")}</SelectItem>
                            {(assignees.data?.users ?? []).map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name ?? user.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>{t("assignedToHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("notes")}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder={t("notesPlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {t("submitting")}
                  </>
                ) : isEdit ? (
                  t("submitEdit")
                ) : (
                  t("submitCreate")
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
