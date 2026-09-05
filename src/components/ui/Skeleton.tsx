import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
  radius?: "sm" | "md" | "lg" | "full" | "field";
  width?: string | number;
  height?: string | number;
}

const RADIUS = {
  sm: "rounded-[8px]",
  md: "rounded-[12px]",
  lg: "rounded-card-sm",
  field: "rounded-field",
  full: "rounded-full",
};

export function Skeleton({ className, radius = "md", width, height }: SkeletonProps) {
  return <div className={cn("skeleton", RADIUS[radius], className)} style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} radius="sm" width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
