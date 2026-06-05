"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  useFormContext,
} from "react-hook-form"

import { cn } from "@/lib/utils"

const Form = React.forwardRef<
  HTMLFormElement,
  React.ComponentProps<"form">
>(({ className, ...props }, ref) => {
  const methods = useFormContext()
  return (
    <form ref={ref} className={className} onSubmit={methods.handleSubmit(() => {})} {...props} />
  )
})
Form.displayName = "Form"

// ============================================================
// FormFieldContext - provides field-level context
// ============================================================

const FormFieldContext = React.createContext<
  ControllerProps<FieldValues, string>
>({} as never)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  const { name } = props

  return (
    <FormFieldContext.Provider value={props as ControllerProps<FieldValues, string>}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

// ============================================================
// useFormField - must be used inside a FormField
// ============================================================

function useFormField(): ControllerProps<FieldValues, string> {
  const fieldContext = React.useContext(FormFieldContext)
  if (!fieldContext) {
    throw new Error("useFormField must be used within a FormField")
  }
  return fieldContext
}

// ============================================================
// FormItem - wraps a labeled form control
// ============================================================

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-2", className)} {...props} />
))
FormItem.displayName = "FormItem"

// ============================================================
// FormLabel
// ============================================================

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  />
))
FormLabel.displayName = LabelPrimitive.Root.displayName

// ============================================================
// FormControl - Slot bridge
// ============================================================

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => (
  <Slot ref={ref} {...props} />
))
FormControl.displayName = "FormControl"

// ============================================================
// FormDescription
// ============================================================

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
FormDescription.displayName = "FormDescription"

// ============================================================
// FormMessage
// ============================================================

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error } = useFormField()
  const body = error ? String(error.message ?? "") : children
  if (!body) return null
  return (
    <p
      ref={ref}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
}
