import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Download, Plus, CreditCard } from "lucide-react";

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

  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing", id],
    queryFn: () => billingApi.get(id!),
    enabled: !!id,
  });

  const paymentMutation = useMutation({
    mutationFn: (amount: number) =>
      billingApi.updatePayment(id!, { paid_amount: amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", id] });
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" });
      addToast({ title: "Success", description: "Payment recorded successfully", variant: "success" });
      setPaymentOpen(false);
      setPaymentAmount("");
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
      <button
        onClick={() => navigate("/billing")}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </button>

      <Card className="p-6 border-border shadow-card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">
                Invoice #{id?.slice(0, 8).toUpperCase()}
              </h1>
              <StatusBadge status={billing.payment_status} />
            </div>
            <p className="text-sm text-text-muted mt-1">
              Created: {new Date(billing.created_at).toLocaleDateString("en-IN")}
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary-hover text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Payment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Payment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
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
                    <Input
                      placeholder="e.g. Cash, Card, UPI"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full bg-primary hover:bg-primary-hover text-white"
                    onClick={() => {
                      const amt = parseFloat(paymentAmount);
                      if (isNaN(amt) || amt <= 0) {
                        addToast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
                        return;
                      }
                      paymentMutation.mutate(amt);
                    }}
                    disabled={paymentMutation.isPending}
                  >
                    {paymentMutation.isPending ? "Processing..." : "Record Payment"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" className="border-primary text-primary" onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">Total Amount</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">
              {formatIndianRupees(billing.total_amount)}
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
    </div>
  );
}
