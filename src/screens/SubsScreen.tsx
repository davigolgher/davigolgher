import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { activeSubscriptions, subscriptionsMonthlyTotal } from "@/lib/calc";
import { Button, DashedEmpty, ScreenHeader, Skeleton } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { SubRow } from "@/components/rows";
import { useModals } from "@/features/modals/ModalsProvider";

export function SubsScreen() {
  const { data, now, loading } = useStore();
  const money = useMoney();
  const { openAddSubscription, openEditSubscription } = useModals();

  const subs = activeSubscriptions(data.subscriptions).sort(
    (a, b) => +new Date(a.nextChargeAt) - +new Date(b.nextChargeAt),
  );
  const monthly = subscriptionsMonthlyTotal(data.subscriptions);

  if (loading) return <SubsSkeleton />;

  const addButton = (
    <Button variant="primary" size="sm" pill leadingIcon={<PlusIcon size={17} strokeWidth={2.2} />} onClick={openAddSubscription}>
      Add Subscription
    </Button>
  );

  return (
    <div className="pb-4">
      <ScreenHeader eyebrow={`${money.format(monthly)} per month`} title="Subscriptions" action={addButton} />

      {subs.length > 0 ? (
        <div className="mt-4 border-t border-line-soft">
          {subs.map((s) => (
            <SubRow key={s.id} subscription={s} now={now} onClick={() => openEditSubscription(s)} />
          ))}
        </div>
      ) : (
        <DashedEmpty
          className="mt-6"
          action={
            <Button variant="primary" pill leadingIcon={<PlusIcon size={17} strokeWidth={2.2} />} onClick={openAddSubscription}>
              Add Subscription
            </Button>
          }
        >
          No subscriptions yet. Add one to see your recurring costs.
        </DashedEmpty>
      )}
    </div>
  );
}

function SubsSkeleton() {
  return (
    <div className="pb-4" aria-busy="true" aria-label="Loading">
      <div className="flex items-start justify-between pt-safe">
        <div className="space-y-2">
          <Skeleton width={130} height={11} radius="sm" />
          <Skeleton width={190} height={30} radius="sm" />
        </div>
        <Skeleton width={150} height={36} radius="full" />
      </div>
      <Skeleton className="mt-6" height={200} radius="lg" />
    </div>
  );
}
