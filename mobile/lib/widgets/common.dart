import 'package:flutter/material.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

class StripeCard extends StatelessWidget {
  const StripeCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: AppColors.navy.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: content,
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.navy,
              letterSpacing: -0.2,
            ),
          ),
        ),
        ?action,
      ],
    );
  }
}

/// Small uppercase label used to partition menus / settings lists.
class MenuSectionLabel extends StatelessWidget {
  const MenuSectionLabel(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8, left: 4),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.textMuted,
          letterSpacing: 0.7,
        ),
      ),
    );
  }
}

/// Grouped menu rows inside a StripeCard with dividers.
/// Pass [label] only when you want a visible section title; omit for silent partitions.
class MenuSection extends StatelessWidget {
  const MenuSection({
    super.key,
    this.label,
    required this.children,
  });

  final String? label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (label != null && label!.trim().isNotEmpty)
          MenuSectionLabel(label!)
        else
          const SizedBox(height: 12),
        StripeCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0)
                  const Divider(height: 1, indent: 56, endIndent: 16),
                children[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class MenuTile extends StatelessWidget {
  const MenuTile({
    super.key,
    required this.icon,
    required this.label,
    this.subtitle,
    this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: Icon(icon, color: AppColors.navy),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
      trailing: trailing ??
          const Icon(Icons.chevron_right, color: AppColors.textMuted),
      onTap: onTap,
    );
  }
}

class ProgressRow extends StatelessWidget {
  const ProgressRow({
    super.key,
    required this.label,
    required this.value,
    required this.total,
    this.unit = '',
    this.compact = false,
  });

  final String label;
  final int value;
  final int total;
  final String unit;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final pct = total <= 0 ? 0.0 : (value / total).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: compact ? 11 : 12,
                  color: AppColors.textMuted,
                ),
              ),
            ),
            Text(
              '$value/$total$unit',
              style: TextStyle(
                fontSize: compact ? 11 : 12,
                fontWeight: FontWeight.w600,
                color: AppColors.navy,
              ),
            ),
          ],
        ),
        SizedBox(height: compact ? 4 : 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            value: pct,
            minHeight: compact ? 3 : 4,
            backgroundColor: AppColors.border,
            color: AppColors.primary,
          ),
        ),
      ],
    );
  }
}

/// Side-by-side pages + audio usage — one short line each.
class CompactUsageStats extends StatelessWidget {
  const CompactUsageStats({
    super.key,
    required this.pagesUsed,
    required this.pagesLimit,
    required this.audioUsed,
    required this.audioLimit,
  });

  final int pagesUsed;
  final int pagesLimit;
  final int audioUsed;
  final int audioLimit;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: ProgressRow(
            label: 'Pages',
            value: pagesUsed,
            total: pagesLimit,
            compact: true,
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: ProgressRow(
            label: 'Audio',
            value: audioUsed,
            total: audioLimit,
            unit: 'm',
            compact: true,
          ),
        ),
      ],
    );
  }
}

/// Collapsed preview of long text; tap to expand / collapse.
class ExpandableText extends StatefulWidget {
  const ExpandableText(
    this.text, {
    super.key,
    this.maxLines = 3,
    this.collapseChars = 160,
    this.style,
    this.expandLabel = 'Read more',
    this.collapseLabel = 'Show less',
  });

  final String text;
  final int maxLines;
  /// Always treat as expandable when longer than this (reliable without layout).
  final int collapseChars;
  final TextStyle? style;
  final String expandLabel;
  final String collapseLabel;

  @override
  State<ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<ExpandableText> {
  bool _expanded = false;

  bool get _long {
    final t = widget.text.trim();
    return t.length > widget.collapseChars ||
        '\n'.allMatches(t).length >= widget.maxLines;
  }

  @override
  Widget build(BuildContext context) {
    final style = widget.style ??
        const TextStyle(
          color: AppColors.textBody,
          height: 1.45,
        );
    final long = _long;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: long ? () => setState(() => _expanded = !_expanded) : null,
          behavior: HitTestBehavior.opaque,
          child: Text(
            widget.text,
            style: style,
            maxLines: (!long || _expanded) ? null : widget.maxLines,
            overflow: (!long || _expanded)
                ? TextOverflow.visible
                : TextOverflow.ellipsis,
          ),
        ),
        if (long)
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                _expanded ? widget.collapseLabel : widget.expandLabel,
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
