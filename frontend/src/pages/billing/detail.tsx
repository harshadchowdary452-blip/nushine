import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/services/endpoints";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatIndianRupees } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Download, Plus, CreditCard, History, Percent, FileText } from "lucide-react";
import { format } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase()}`;
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>;
}

export default function BillingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState("PERCENTAGE");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountFixed, setDiscountFixed] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing", id],
    queryFn: () => billingApi.get(id!),
    enabled: !!id,
  });

  const { data: transactions } = useQuery({
    queryKey: ["billing", id, "transactions"],
    queryFn: () => billingApi.getTransactions(id!),
    enabled: historyOpen,
  });

  const originalAmount = billing?.original_amount || billing?.total_amount || 0;

  const computedDiscount = useMemo(() => {
    if (!discountPercent && !discountFixed) return 0;
    if (discountType === "PERCENTAGE") {
      const pct = parseFloat(discountPercent) || 0;
      return (originalAmount * pct) / 100;
    } else {
      return parseFloat(discountFixed) || 0;
    }
  }, [discountType, discountPercent, discountFixed, originalAmount]);

  const computedFinal = originalAmount - computedDiscount;
  const computedPending = computedFinal - (billing?.paid_amount || 0);

  const paymentMutation = useMutation({
    mutationFn: (data: { paid_amount: number; payment_method: string }) =>
      billingApi.updatePayment(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", id] });
      queryClient.removeQueries({ queryKey: ["billing", id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billings"] });
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" });
      addToast({ title: "Success", description: "Payment recorded successfully", variant: "success" });
      setPaymentOpen(false);
      setPaymentAmount("");
      setPaymentMethod("");
    },
    onError: (err: Error) => {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const discountMutation = useMutation({
    mutationFn: (data: { discount_type: string; discount_percent: number; discount_amount: number; discount_reason?: string }) =>
      billingApi.applyDiscount(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", id] });
      queryClient.invalidateQueries({ queryKey: ["billings"] });
      addToast({ title: "Success", description: "Discount applied successfully", variant: "success" });
      setDiscountOpen(false);
      setDiscountPercent("");
      setDiscountFixed("");
      setDiscountReason("");
    },
    onError: (err: Error) => {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const downloadPdf = async () => {
    try {
      const blob = await billingApi.getPdf(id!);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${id?.slice(0, 8)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      addToast({ title: "Error", description: "Failed to download PDF", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-text-secondary">Billing not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/billing")}>
          Back to Billing
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/billing")}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Billing
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">
            Invoice #{billing.invoice_number || id?.slice(0, 8).toUpperCase()}
          </h1>
          <StatusBadge status={billing.payment_status} />
        </div>
      </div>

      <Tabs defaultValue="invoice" className="w-full">
        <TabsList className="bg-white border border-border rounded-xl p-1">
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="pdf">PDF</TabsTrigger>
        </TabsList>

        <TabsContent value="invoice" className="mt-6 space-y-6">
          <Card className="p-6 border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-text-muted">
                  Created: {new Date(billing.created_at).toLocaleDateString("en-IN")}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setDiscountOpen(true) }}>
                <Percent className="h-4 w-4 mr-1.5" />
                Apply Discount
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">Original Amount</p>
                <p className="text-2xl font-bold text-blue-800 mt-1">
                  {formatIndianRupees(billing.original_amount || billing.total_amount)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                <p className="text-sm text-green-600 font-medium">Paid Amount</p>
                <p className="text-2xl font-bold text-green-800 mt-1">
                  {formatIndianRupees(billing.paid_amount)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
                <p className="text-sm text-amber-600 font-medium">Pending Amount</p>
                <p className="text-2xl font-bold text-amber-800 mt-1">
                  {formatIndianRupees(billing.pending_amount)}
                </p>
              </div>
              <div className={`rounded-xl p-4 border ${billing.discount_percent > 0 || billing.discount_amount > 0 ? "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200" : "bg-gray-50 border-gray-200"}`}>
                <p className="text-sm text-purple-600 font-medium">Discount</p>
                <p className="text-2xl font-bold mt-1">
                  {(billing.discount_percent > 0 || billing.discount_amount > 0) ? (
                    <span className="text-purple-800">
                      {billing.discount_type === "PERCENTAGE"
                        ? `${billing.discount_percent}%`
                        : formatIndianRupees(billing.discount_amount)}
                      {" "}
                      ({formatIndianRupees(billing.discount_amount)})
                    </span>
                  ) : (
                    <span className="text-gray-400 text-lg">No discount</span>
                  )}
                </p>
                {billing.discount_reason && (
                  <p className="text-xs text-gray-500 mt-1">{billing.discount_reason}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4 border border-indigo-200">
                <p className="text-sm text-indigo-600 font-medium">Final Amount</p>
                <p className="text-2xl font-bold text-indigo-800 mt-1">
                  {formatIndianRupees(billing.total_amount)}
                </p>
              </div>
              {billing.paid_at && (
                <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-4 border border-teal-200">
                  <p className="text-sm text-teal-600 font-medium">Paid On</p>
                  <p className="text-xl font-bold text-teal-800 mt-1">
                    {new Date(billing.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 border-border shadow-card">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Payment Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-text-muted">Payment Status</p>
                <p className="font-medium"><StatusBadge status={billing.payment_status} /></p>
              </div>
              {billing.payment_method && (
                <div>
                  <p className="text-sm text-text-muted">Payment Method</p>
                  <p className="font-medium">{billing.payment_method}</p>
                </div>
              )}
              {billing.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm text-text-muted">Notes</p>
                  <p className="font-medium">{billing.notes}</p>
                </div>
              )}
            </div>
          </Card>

          {(billing.patient_name || billing.case_chief_complaint) && (
            <Card className="p-6 border-border shadow-card">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Related Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {billing.patient_name && (
                  <div>
                    <p className="text-sm text-text-muted">Patient</p>
                    <p className="font-medium">{billing.patient_name}</p>
                  </div>
                )}
                {billing.case_chief_complaint && (
                  <div>
                    <p className="text-sm text-text-muted">Case</p>
                    <p className="font-medium">{billing.case_chief_complaint}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-6 space-y-6">
          <Card className="p-6 border-border shadow-card">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Record Payment
            </h2>
            <div className="space-y-4 max-w-md">
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="INSURANCE">Insurance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="bg-primary hover:bg-primary-hover text-white"
                onClick={() => {
                  const amt = parseFloat(paymentAmount);
                  if (isNaN(amt) || amt <= 0) {
                    addToast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
                    return;
                  }
                  paymentMutation.mutate({ paid_amount: amt, payment_method: paymentMethod });
                }}
                disabled={paymentMutation.isPending}
              >
                {paymentMutation.isPending ? "Processing..." : "Record Payment"}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="p-6 border-border shadow-card">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Payment History
            </h2>
            {(() => {
              if (!transactions || transactions.length === 0) {
                return <p className="text-center text-sm text-text-muted py-8">No payment transactions recorded yet.</p>;
              }
              return (
                <div className="space-y-3">
                  {transactions.map((txn: any) => (
                    <div key={txn.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-semibold text-green-700">{formatIndianRupees(txn.amount)}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {txn.payment_method || "\u2014"}
                          {txn.notes ? ` \u00b7 ${txn.notes}` : ""}
                        </p>
                      </div>
                      <p className="text-xs text-text-muted">
                        {format(new Date(txn.created_at), "MMM dd, yyyy h:mm a")}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        </TabsContent>

        <TabsContent value="pdf" className="mt-6">
          <Card className="p-6 border-border shadow-card text-center">
            <FileText className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-text-primary mb-2">Invoice PDF</h2>
            <p className="text-sm text-text-muted mb-6">Download the invoice as a professionally formatted PDF document.</p>
            <Button onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              Download Invoice PDF
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Discount dialog */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Discount Type</Label>
              <Select value={discountType} onValueChange={(v) => { setDiscountType(v); setDiscountPercent(""); setDiscountFixed(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                  <SelectItem value="FIXED">Fixed Amount (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {discountType === "PERCENTAGE" ? (
              <div>
                <Label>Discount (%)</Label>
                <Input type="number" min="0" max="100" placeholder="Enter percentage"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)} />
              </div>
            ) : (
              <div>
                <Label>Discount Amount (₹)</Label>
                <Input type="number" min="0" placeholder="Enter amount"
                  value={discountFixed}
                  onChange={(e) => setDiscountFixed(e.target.value)} />
              </div>
            )}
            <div className="rounded-lg bg-gray-50 p-3 space-y-1 text-sm">
              <p className="flex justify-between">
                <span>Original Amount:</span>
                <span className="font-semibold">{formatIndianRupees(originalAmount)}</span>
              </p>
              {computedDiscount > 0 && (
                <p className="flex justify-between text-green-600">
                  <span>Discount:</span>
                  <span className="font-semibold">-{formatIndianRupees(computedDiscount)}</span>
                </p>
              )}
              <p className="flex justify-between border-t pt-1">
                <span>Final Amount:</span>
                <span className="font-semibold">{formatIndianRupees(Math.max(0, computedFinal))}</span>
              </p>
              <p className="flex justify-between">
                <span>Amount Paid:</span>
                <span className="font-semibold text-green-600">{formatIndianRupees(billing.paid_amount)}</span>
              </p>
              <p className="flex justify-between">
                <span>Balance Amount:</span>
                <span className={`font-semibold ${computedPending > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {formatIndianRupees(Math.max(0, computedPending))}
                </span>
              </p>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input placeholder="e.g. Loyalty discount"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)} />
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => {
                if (discountType === "PERCENTAGE") {
                  const pct = parseFloat(discountPercent);
                  if (isNaN(pct) || pct < 0 || pct > 100) {
                    addToast({ title: "Error", description: "Enter a valid percentage (0-100)", variant: "destructive" });
                    return;
                  }
                  discountMutation.mutate({
                    discount_type: "PERCENTAGE",
                    discount_percent: pct,
                    discount_amount: 0,
                    discount_reason: discountReason || undefined,
                  });
                } else {
                  const amt = parseFloat(discountFixed);
                  if (isNaN(amt) || amt <= 0 || amt >= originalAmount) {
                    addToast({ title: "Error", description: "Enter a valid discount amount", variant: "destructive" });
                    return;
                  }
                  discountMutation.mutate({
                    discount_type: "FIXED",
                    discount_percent: 0,
                    discount_amount: amt,
                    discount_reason: discountReason || undefined,
                  });
                }
              }}
              disabled={discountMutation.isPending}>
              {discountMutation.isPending ? "Applying..." : "Apply Discount"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
