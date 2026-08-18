import { useState, useMemo, useCallback } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search, ChevronDown, ChevronRight, HelpCircle, BookOpen,
  Mail, ExternalLink, ArrowRight,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import type { Role } from "@/types"
import {
  helpByRole, searchHelp,
  type HelpRole, type FaqItem, type WorkflowGuide, type HelpCategory,
} from "@/data/help-content"

const roleMap: Record<string, HelpRole> = {
  GROUP_ADMIN: "GROUP_ADMIN",
  HOSPITAL_ADMIN: "HOSPITAL_ADMIN",
  DOCTOR: "DOCTOR",
}

const roleLabels: Record<HelpRole, string> = {
  GROUP_ADMIN: "Group Admin",
  HOSPITAL_ADMIN: "Hospital Admin",
  DOCTOR: "Doctor",
}

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[var(--ds-border)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--ds-surface-secondary)] transition-colors"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-[var(--ds-text)]">{item.question}</span>
        <ChevronDown className={`h-4 w-4 text-[var(--ds-text-tertiary)] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 border-t border-[var(--ds-border-light)]">
              <p className="text-sm text-[var(--ds-text-secondary)] mt-3 leading-relaxed">{item.answer}</p>
              {item.steps && item.steps.length > 0 && (
                <ol className="mt-3 space-y-1.5">
                  {item.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--ds-text-secondary)]">
                      <span className="w-5 h-5 rounded-full bg-[var(--ds-primary)]/10 text-[var(--ds-primary)] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              {item.linkTo && (
                <Link
                  to={item.linkTo}
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-[var(--ds-primary)] hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {item.linkLabel || "Open page"}
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function WorkflowCard({ item }: { item: WorkflowGuide }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[var(--ds-border)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--ds-surface-secondary)] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--ds-primary)]/10 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-[var(--ds-primary)]" strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-sm font-medium text-[var(--ds-text)]">{item.title}</span>
            <p className="text-xs text-[var(--ds-text-tertiary)] mt-0.5">{item.description}</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-[var(--ds-text-tertiary)] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 border-t border-[var(--ds-border-light)]">
              <ol className="mt-3 space-y-2">
                {item.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--ds-text-secondary)]">
                    <span className="w-5 h-5 rounded-full bg-[var(--ds-primary)]/10 text-[var(--ds-primary)] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              {item.linkTo && (
                <Link
                  to={item.linkTo}
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-[var(--ds-primary)] hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {item.linkLabel || "Open page"}
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CategorySection({ category }: { category: HelpCategory }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-[var(--ds-text)] mb-3">{category.label}</h3>
      {category.faqs.length > 0 && (
        <div className="space-y-2 mb-4">
          {category.faqs.map((faq) => (
            <FaqAccordion key={faq.id} item={faq} />
          ))}
        </div>
      )}
      {category.workflows.length > 0 && (
        <div className="space-y-2">
          {category.workflows.map((wf) => (
            <WorkflowCard key={wf.id} item={wf} />
          ))}
        </div>
      )}
    </div>
  )
}

function RelatedQuestions({ faq, allFaqs }: { faq: FaqItem; allFaqs: FaqItem[] }) {
  if (!faq.relatedIds || faq.relatedIds.length === 0) return null
  const related = faq.relatedIds
    .map((id) => allFaqs.find((f) => f.id === id))
    .filter((f): f is FaqItem => !!f)
  if (related.length === 0) return null
  return (
    <div className="mt-3 pt-3 border-t border-[var(--ds-border-light)]">
      <p className="text-[11px] font-medium text-[var(--ds-text-tertiary)] mb-1.5">Related Questions</p>
      <div className="flex flex-wrap gap-1.5">
        {related.map((r) => (
          <span key={r.id} className="text-xs text-[var(--ds-primary)] bg-[var(--ds-primary)]/5 px-2 py-1 rounded-lg">
            {r.question}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function HelpPage() {
  const { user } = useAuthStore()
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"faq" | "workflows" | "contact">("faq")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const role: HelpRole = roleMap[(user?.role as Role) || "DOCTOR"] || "DOCTOR"
  const helpData = helpByRole[role]

  const searchResults = useMemo(() => {
    if (!query.trim()) return null
    return searchHelp(helpData, query.trim())
  }, [query, helpData])

  const allFaqs = useMemo(() => {
    return helpData.categories.flatMap((c) => c.faqs)
  }, [helpData])

  const filteredCategories = useMemo(() => {
    if (activeCategory) {
      return helpData.categories.filter((c) => c.id === activeCategory)
    }
    return helpData.categories
  }, [helpData, activeCategory])

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    if (e.target.value.trim()) {
      setActiveTab("faq")
      setActiveCategory(null)
    }
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--ds-primary)]/10 mb-4">
          <HelpCircle className="h-6 w-6 text-[var(--ds-primary)]" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--ds-text)] tracking-tight">Help Center</h1>
        <p className="text-sm text-[var(--ds-text-secondary)] mt-1.5">
          {roleLabels[role]} — Find answers and learn how to use Appointin.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-tertiary)]" />
        <input
          type="text"
          value={query}
          onChange={handleSearch}
          placeholder="Search help, workflows and frequently asked questions..."
          className="w-full h-12 pl-11 pr-4 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-sm text-[var(--ds-text)] placeholder-[var(--ds-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20 focus:border-[var(--ds-primary)] transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="mb-8">
          <p className="text-xs font-medium text-[var(--ds-text-tertiary)] mb-4">
            {searchResults.faqs.length + searchResults.workflows.length} results for &ldquo;{query}&rdquo;
          </p>
          {searchResults.faqs.length > 0 && (
            <div className="space-y-2 mb-6">
              {searchResults.faqs.map((faq) => (
                <FaqAccordion key={faq.id} item={faq} />
              ))}
            </div>
          )}
          {searchResults.workflows.length > 0 && (
            <div className="space-y-2">
              {searchResults.workflows.map((wf) => (
                <WorkflowCard key={wf.id} item={wf} />
              ))}
            </div>
          )}
          {searchResults.faqs.length === 0 && searchResults.workflows.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--ds-text-tertiary)]">No results found. Try different keywords.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      {!searchResults && (
        <>
          <div className="flex items-center gap-1 mb-6 border-b border-[var(--ds-border)] overflow-x-auto">
            {[
              { key: "faq" as const, label: "FAQ", icon: HelpCircle },
              { key: "workflows" as const, label: "Workflow Guides", icon: BookOpen },
              { key: "contact" as const, label: "Contact Support", icon: Mail },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setActiveTab(tab.key); setActiveCategory(null) }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-[var(--ds-primary)] text-[var(--ds-primary)]"
                    : "border-transparent text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)]"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* FAQ Tab */}
          {activeTab === "faq" && (
            <div>
              {/* Category Filter */}
              <div className="flex items-center gap-1.5 mb-6 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    !activeCategory
                      ? "bg-[var(--ds-primary)] text-white"
                      : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface)]"
                  }`}
                >
                  All
                </button>
                {helpData.categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeCategory === cat.id
                        ? "bg-[var(--ds-primary)] text-white"
                        : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface)]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="space-y-8">
                {filteredCategories.map((cat) => (
                  <CategorySection key={cat.id} category={cat} />
                ))}
              </div>
            </div>
          )}

          {/* Workflows Tab */}
          {activeTab === "workflows" && (
            <div className="space-y-8">
              {helpData.categories.filter((c) => c.workflows.length > 0).map((cat) => (
                <div key={cat.id}>
                  <h3 className="text-sm font-bold text-[var(--ds-text)] mb-3">{cat.label}</h3>
                  <div className="space-y-2">
                    {cat.workflows.map((wf) => (
                      <WorkflowCard key={wf.id} item={wf} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contact Tab */}
          {activeTab === "contact" && (
            <div className="max-w-lg mx-auto text-center py-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--ds-primary)]/10 mb-5">
                <Mail className="h-7 w-7 text-[var(--ds-primary)]" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-bold text-[var(--ds-text)] mb-2">Still need help?</h3>
              <p className="text-sm text-[var(--ds-text-secondary)] mb-6">
                Can&rsquo;t find the answer you&rsquo;re looking for? Our support team is ready to assist you.
              </p>
              <a
                href={`mailto:superadmin@appointin.com?subject=${encodeURIComponent(`Appointin Help Request — ${roleLabels[role]}`)}`}
                className="inline-flex items-center gap-2 bg-[var(--ds-primary)] hover:bg-[var(--ds-primary-hover)] text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-md shadow-[var(--ds-primary)]/20 text-sm"
              >
                <Mail className="h-4 w-4" />
                Contact Support
              </a>
              <p className="text-xs text-[var(--ds-text-tertiary)] mt-4">
                superadmin@appointin.com
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
