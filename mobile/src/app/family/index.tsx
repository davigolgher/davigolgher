/**
 * Flow Family's front door.
 *
 * Not in a family: what it is, what it isn't, and the two ways in (start a
 * family, or join one with a code). In one: the guardian's people and the
 * dependent's sharing, side by side when someone is both.
 */
import { Pressable, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { familyApi } from "@/lib/backend/family";
import { KIND_LABEL } from "@/lib/family/copy";
import { Button, Group, GroupRow } from "~/components/ui";
import { useFamily, useFamilyLive } from "~/features/family/FamilyProvider";
import { useFamilyQuery } from "~/features/family/useFamilyQuery";
import { Badge, Empty, Failed, FamilyScroll, Lead, Loading, Notice, SavedNotice, Section } from "~/features/family/ui";
import { BellIcon, ShieldIcon, UsersIcon } from "~/features/family/icons";
import { iconSize } from "~/theme/tokens";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default function FamilyHome() {
  useFamilyLive();
  const { state, loading, error, savedAt, refresh, isGuardian, isDependent, familyOnly } = useFamily();
  const alerts = useFamilyQuery(isGuardian && state ? "alerts" : null, () => familyApi.alerts(state!.user_id, 50), { live: true });
  const unread = (alerts.data ?? []).filter((a) => !a.read_at).length;

  const header = (
    <Stack.Screen
      options={{
        headerRight: familyOnly
          ? () => (
              <Pressable onPress={() => router.push("/family/account")} accessibilityRole="button" hitSlop={10} className="px-1 py-2 active:opacity-60">
                <Text className="text-body font-semibold text-chalk">Account</Text>
              </Pressable>
            )
          : undefined,
      }}
    />
  );

  if (!state && loading) return (<>{header}<Loading /></>);
  if (!state && error) return (<>{header}<Failed message={error.message} onRetry={() => void refresh()} /></>);
  if (!state) return header;

  const g = state.guardian_of;

  return (
    <>
      {header}
      <FamilyScroll onRefresh={() => void refresh()}>
        <SavedNotice savedAt={savedAt} />

        {!isGuardian && !isDependent ? <Welcome /> : null}

        {g ? (
          <Section label={g.family.name}>
            <View className="flex-row items-center gap-2">
              <Badge tone={g.plan === "paid" ? "ok" : "info"}>{g.plan === "paid" ? "Flow subscription" : "Free plan"}</Badge>
              {g.plan === "free" ? <Text className="text-caption text-chalk-mute">1 person · 1 account · basic alerts</Text> : null}
            </View>

            {g.dependents.length === 0 ? (
              <Empty title="Nobody is sharing yet" action={<Button variant="primary" onPress={() => router.push("/family/invite")}>Invite someone</Button>}>
                Invite a child, a parent or anyone you look after. They choose what to share, and can stop at any time.
              </Empty>
            ) : (
              <View className="mt-3">
                <Group>
                  {g.dependents.map((d) => {
                    const c = d.consent;
                    const sub = d.locked
                      ? "Locked on the free plan — subscribe to see more than one person"
                      : c?.status === "active"
                        ? `${KIND_LABEL[d.kind]} · sharing until ${dateFmt.format(new Date(c.expires_at))}`
                        : "Not sharing — they stopped, or the period ended";
                    return (
                      <GroupRow
                        key={d.user_id}
                        title={d.display_name}
                        sub={sub}
                        onPress={c?.status === "active" && !d.locked ? () => router.push(`/family/dependent/${d.user_id}`) : undefined}
                        accessibilityHint="Opens their spending"
                      />
                    );
                  })}
                </Group>
              </View>
            )}

            <View className="mt-3">
              <Group>
                <GroupRow title="Invite someone" sub={g.invites.length ? `${g.invites.length} invitation${g.invites.length === 1 ? "" : "s"} waiting` : undefined} onPress={() => router.push("/family/invite")} />
                <GroupRow title="Alerts" sub={unread ? `${unread} new` : "Purchases and connections to watch"} onPress={() => router.push("/family/alerts")} />
                <GroupRow title="Manage family" sub="Members, invitations, plan" onPress={() => router.push("/family/manage")} />
              </Group>
            </View>
          </Section>
        ) : null}

        {state.dependent_of.map((d) => {
          const active = d.consent?.status === "active";
          const guardians = d.guardians.map((x) => x.display_name).join(", ");
          return (
            <Section key={d.family.id} label={`Sharing with ${d.family.name}`}>
              {active ? (
                <Notice tone="info" title={`${guardians} can see your shared spending`}>
                  Until {dateFmt.format(new Date(d.consent!.expires_at))}. You choose the accounts, and you can stop at any time.
                </Notice>
              ) : (
                <Notice tone="warn" title="Not sharing">
                  {guardians} can't see anything of yours right now.
                </Notice>
              )}
              <View className="mt-3">
                <Group>
                  <GroupRow title="Sharing" sub="Who sees what, access history, stop sharing" onPress={() => router.push("/family/sharing")} />
                  <GroupRow title="Bank accounts" sub="Connect a bank and choose accounts" onPress={() => router.push("/family/connect")} />
                </Group>
              </View>
            </Section>
          );
        })}

        {isGuardian || isDependent ? (
          <Section label="More">
            <Group>
              {!isGuardian ? <GroupRow title="Start your own family" onPress={() => router.push("/family/create")} /> : null}
              <GroupRow title="Join with a code" onPress={() => router.push("/family/join")} />
            </Group>
          </Section>
        ) : null}
      </FamilyScroll>
    </>
  );
}

function Welcome() {
  return (
    <View>
      <Text className="mt-2 text-title font-bold text-chalk" accessibilityRole="header">
        Flow Family
      </Text>
      <Lead>
        Follow the spending of someone you look after — a child, a teenager, an older parent — from the bank accounts they
        choose to share through open banking — in Brazil, the US, Canada, the UK, Europe and many more countries.
      </Lead>

      <View className="mt-6 gap-4">
        <Point icon={<UsersIcon size={iconSize.lg} />} title="They choose, and they can stop">
          Nothing is shared without their consent (or a parent's, for under-18s). They see exactly what you see, and can
          stop sharing at any time.
        </Point>
        <Point icon={<BellIcon size={iconSize.lg} />} title="Alerts that matter">
          A purchase above an amount, betting sites, a monthly budget passed, a bank connection that stopped.
        </Point>
        <Point icon={<ShieldIcon size={iconSize.lg} />} title="See, never touch">
          Flow Family only shows spending. It can't move money, block purchases or see bank passwords.
        </Point>
      </View>

      <View className="mt-8 gap-3">
        <Button variant="primary" size="lg" fullWidth onPress={() => router.push("/family/create")}>
          Start a family
        </Button>
        <Button variant="secondary" size="lg" fullWidth onPress={() => router.push("/family/join")}>
          I have an invitation code
        </Button>
      </View>
      <Text className="mt-4 text-center text-caption text-chalk-mute">
        Free for one person and one account. A Flow subscription adds more people, more alerts and a monthly PDF report.
      </Text>
      <Pressable onPress={() => router.push("/legal?doc=family")} accessibilityRole="link" className="mt-2 items-center py-2 active:opacity-60">
        <Text className="text-footnote font-medium text-chalk-mute underline">Flow Family Privacy & Terms</Text>
      </Pressable>
    </View>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View className="flex-row gap-3" accessible>
      <View className="mt-0.5">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-body font-semibold text-chalk">{title}</Text>
        <Text className="mt-1 text-footnote text-chalk-mute">{children}</Text>
      </View>
    </View>
  );
}
