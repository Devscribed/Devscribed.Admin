/* @ds-bundle: {"format":4,"namespace":"TeammerlyMeridianDesignSystem_063f40","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"InfoBanner","sourcePath":"components/feedback/InfoBanner.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"RadioGroup","sourcePath":"components/forms/Radio.jsx"},{"name":"SearchField","sourcePath":"components/forms/SearchField.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"NavItem","sourcePath":"components/navigation/NavItem.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Toggle","sourcePath":"components/navigation/Toggle.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"Modal","sourcePath":"components/surfaces/Modal.jsx"},{"name":"SectionLabel","sourcePath":"components/typography/SectionLabel.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"Eye","sourcePath":"components/icons/Eye.jsx"},{"name":"EyeOff","sourcePath":"components/icons/Eye.jsx"},{"name":"AuthLayout","sourcePath":"components/surfaces/AuthLayout.jsx"},{"name":"Spinner","sourcePath":"components/feedback/Spinner.jsx"}],"sourceHashes":{"components/data/Table.jsx":"0ceb99ee3c62","components/feedback/Badge.jsx":"fd196613fabf","components/feedback/InfoBanner.jsx":"1a6fd57449af","components/forms/Checkbox.jsx":"da4073b1c070","components/forms/Radio.jsx":"57d1b71513f1","components/forms/SearchField.jsx":"c37bc9f13e21","components/forms/Select.jsx":"a6ad2bab040c","components/navigation/NavItem.jsx":"be9816ba9b09","components/navigation/Tabs.jsx":"28212277943a","components/navigation/Toggle.jsx":"a14a18a35252","components/surfaces/Card.jsx":"d38ffa714a4d","components/surfaces/Modal.jsx":"f2b9c6d5f915","components/typography/SectionLabel.jsx":"3990f244c1ac"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.TeammerlyMeridianDesignSystem_063f40 = window.TeammerlyMeridianDesignSystem_063f40 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/feedback/Spinner.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Spinner({
  size = 15,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("svg", _extends({}, rest, {
    viewBox: "0 0 16 16",
    width: size,
    height: size,
    fill: "none",
    "aria-hidden": true,
    style: style
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "6.25",
    stroke: "currentColor",
    strokeWidth: "2",
    opacity: "0.3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 1.75A6.25 6.25 0 0 1 14.25 8",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("animateTransform", {
    attributeName: "transform",
    type: "rotate",
    from: "0 8 8",
    to: "360 8 8",
    dur: "0.7s",
    repeatCount: "indefinite"
  })));
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const { Spinner } = __ds_scope;
const base = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  border: '1.5px solid transparent',
  cursor: 'pointer',
  transition: 'filter var(--duration-slow) var(--easing-standard),transform var(--duration-fast) var(--easing-standard)',
  whiteSpace: 'nowrap'
};
const sizes = {
  sm: {
    height: 'var(--field-h-sm)',
    padding: '0 15px',
    fontSize: 'var(--fs-13)',
    borderRadius: 'var(--radius-lg)'
  },
  md: {
    height: 'var(--field-h)',
    padding: '0 20px',
    fontSize: 'var(--fs-15)',
    borderRadius: 'var(--radius-lg)'
  },
  lg: {
    height: 'var(--field-h-lg)',
    padding: '0 22px',
    fontSize: 'var(--fs-15)',
    borderRadius: 'var(--radius-lg)'
  }
};
const variants = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    borderColor: 'var(--accent)',
    boxShadow: 'var(--lip-accent)'
  },
  secondary: {
    background: 'var(--bg-panel)',
    color: 'var(--text-sub)',
    borderColor: 'var(--border-strong)',
    fontWeight: 500
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-sub)',
    borderColor: 'transparent',
    fontWeight: 500
  },
  danger: {
    background: 'var(--error-500)',
    color: '#fff',
    borderColor: 'var(--error-500)',
    boxShadow: 'var(--lip-error)'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  glow,
  style,
  children,
  ...rest
}) {
  const s = {
    ...base,
    ...sizes[size],
    ...variants[variant]
  };
  if (glow && variant === 'primary') s.boxShadow = 'var(--lip-accent),var(--glow-accent-dark)';
  if (loading) {
    s.boxShadow = 'none';
    s.cursor = 'progress';
  }
  if (disabled) {
    s.opacity = 0.55;
    s.cursor = 'not-allowed';
  }
  return /*#__PURE__*/React.createElement("button", _extends({}, rest, {
    disabled: disabled || loading,
    "aria-busy": loading || undefined,
    style: {
      ...s,
      ...style
    }
  }), loading && /*#__PURE__*/React.createElement(Spinner, null), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
function Table({
  columns = [],
  rows = [],
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 52,
      padding: '0 18px',
      background: 'var(--bg-header)',
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-11)',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, columns.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: c.flex || 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: c.align || 'flex-start'
    }
  }, c.label))), rows.map((r, ri) => /*#__PURE__*/React.createElement("div", {
    key: r.id ?? ri,
    onMouseEnter: e => e.currentTarget.style.background = 'var(--hover-bg-tint)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      display: 'flex',
      minHeight: 62,
      padding: '0 18px',
      alignItems: 'center',
      borderTop: '1px solid var(--divider)',
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-15)',
      color: 'var(--text)',
      opacity: r.dim ? 0.65 : 1,
      transition: 'background .12s'
    }
  }, columns.map((c, ci) => /*#__PURE__*/React.createElement("div", {
    key: ci,
    style: {
      flex: c.flex || 1,
      minWidth: 0,
      textAlign: c.align === 'flex-end' ? 'right' : c.align === 'center' ? 'center' : 'left',
      display: 'flex',
      justifyContent: c.align || 'flex-start',
      alignItems: 'center',
      fontFamily: c.mono ? 'var(--font-display)' : 'var(--font-text)',
      fontWeight: c.mono ? 600 : 400
    }
  }, typeof c.render === 'function' ? c.render(r) : r[c.key])))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  active: {
    bg: 'var(--status-active-bg)',
    ink: 'var(--status-active-ink)',
    dot: 'var(--status-active-dot)'
  },
  inactive: {
    bg: 'var(--status-inactive-bg)',
    ink: 'var(--status-inactive-ink)',
    dot: 'var(--status-inactive-dot)'
  },
  warning: {
    bg: 'var(--amber-100)',
    ink: 'var(--amber-800)',
    dot: 'var(--amber-500)'
  },
  info: {
    bg: 'var(--violet-200)',
    ink: 'var(--accent)',
    dot: 'var(--accent)'
  },
  neutral: {
    bg: 'var(--paper-200)',
    ink: 'var(--ink-500)',
    dot: 'var(--ink-500)'
  }
};
function Badge({
  tone = 'neutral',
  dot = true,
  outline,
  children,
  style,
  ...rest
}) {
  const c = tones[tone] || tones.neutral;
  const s = outline ? {
    border: `1.5px solid ${c.dot}`,
    color: c.ink,
    background: 'transparent'
  } : {
    background: c.bg,
    color: c.ink
  };
  return /*#__PURE__*/React.createElement("span", _extends({}, rest, {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      borderRadius: 'var(--radius-pill)',
      padding: '4px 12px',
      fontFamily: 'var(--font-text)',
      fontWeight: 600,
      fontSize: 'var(--fs-12)',
      ...s,
      ...style
    }
  }), dot && !outline && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: c.dot
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/InfoBanner.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  info: {
    border: 'oklch(0.85 0.06 292)',
    bg: 'oklch(0.97 0.02 292)',
    ink: 'var(--accent)'
  },
  warning: {
    border: 'oklch(0.82 0.09 74)',
    bg: 'oklch(0.96 0.04 74)',
    ink: 'var(--amber-800)'
  },
  error: {
    border: 'oklch(0.8 0.1 25)',
    bg: 'oklch(0.96 0.03 25)',
    ink: 'var(--error-500)'
  },
  success: {
    border: 'oklch(0.8 0.08 160)',
    bg: 'oklch(0.96 0.03 160)',
    ink: 'var(--success-700)'
  }
};
const InfoGlyph = ({
  color
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 16 16",
  width: 18,
  height: 18,
  fill: color,
  "aria-hidden": true
}, /*#__PURE__*/React.createElement("circle", {
  cx: "8",
  cy: "8",
  r: "8",
  opacity: "0.15"
}), /*#__PURE__*/React.createElement("rect", {
  x: "7.1",
  y: "6.5",
  width: "1.8",
  height: "6",
  rx: "0.9"
}), /*#__PURE__*/React.createElement("rect", {
  x: "7.1",
  y: "3.5",
  width: "1.8",
  height: "1.8",
  rx: "0.9"
}));
function InfoBanner({
  tone = 'info',
  icon,
  children,
  style,
  ...rest
}) {
  const c = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 14px',
      borderRadius: 'var(--radius-lg)',
      border: `1px solid ${c.border}`,
      background: c.bg,
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-13)',
      color: 'var(--text-sub)',
      ...style
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexShrink: 0,
      color: c.ink
    }
  }, icon || /*#__PURE__*/React.createElement(InfoGlyph, {
    color: c.ink
  })), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { InfoBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/InfoBanner.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const Check = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  width: 13,
  height: 13,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true
}, /*#__PURE__*/React.createElement("path", {
  d: "M5 12.5l4.5 4.5L19 6.5"
}));
function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-15)',
      color: 'var(--text-sub)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      userSelect: 'none',
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 'var(--radius-xs)',
      background: checked ? 'var(--accent)' : 'var(--bg-field)',
      border: checked ? 'none' : '1.5px solid var(--border-strong)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      flexShrink: 0,
      transition: 'background .12s, border-color .12s'
    }
  }, checked && /*#__PURE__*/React.createElement(Check, null)), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!checked,
    onChange: e => onChange && onChange(e.target.checked),
    disabled: disabled,
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
      pointerEvents: 'none'
    }
  }), label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
function Input({
  label,
  error,
  hint,
  trailing,
  style,
  wrapperStyle,
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  const borderColor = error ? 'var(--error-500)' : focus ? 'var(--accent)' : 'var(--border-strong)';
  const ring = focus ? error ? 'var(--shadow-glow-error)' : 'var(--shadow-glow-accent)' : 'none';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      ...wrapperStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--fs-11)',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: error ? 'var(--error-500)' : 'var(--text-muted)',
      marginBottom: 6
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      height: 'var(--field-h-lg)',
      width: '100%',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 'var(--radius-lg)',
      padding: trailing ? '0 44px 0 12px' : '0 12px',
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-15)',
      color: 'var(--text)',
      background: 'var(--bg-field)',
      outline: 'none',
      boxShadow: ring,
      transition: 'border-color .15s, box-shadow .15s',
      cursor: rest.disabled ? 'not-allowed' : 'text',
      opacity: rest.disabled ? 0.55 : 1,
      ...style
    }
  })), trailing && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 6,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      alignItems: 'center'
    }
  }, trailing)), (error || hint) && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-12)',
      color: error ? 'var(--error-500)' : 'var(--text-muted)',
      marginTop: 5
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Radio({
  checked,
  onChange,
  label,
  disabled,
  name,
  value,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-15)',
      color: 'var(--text-sub)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      userSelect: 'none',
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: 'var(--bg-field)',
      border: checked ? '6px solid var(--accent)' : '1.5px solid var(--border-strong)',
      display: 'inline-flex',
      flexShrink: 0,
      boxSizing: 'border-box',
      transition: 'border-color .12s, border-width .12s'
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: name,
    value: value,
    checked: !!checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
      pointerEvents: 'none'
    }
  }), label);
}
function RadioGroup({
  value,
  onChange,
  options = [],
  name = 'radio',
  direction = 'column',
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "radiogroup",
    style: {
      display: 'flex',
      flexDirection: direction,
      gap: direction === 'row' ? 20 : 12,
      ...style
    }
  }, rest), options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    const od = disabled || typeof o === 'object' && o.disabled;
    return /*#__PURE__*/React.createElement(Radio, {
      key: v,
      name: name,
      value: v,
      label: l,
      checked: v === value,
      disabled: od,
      onChange: () => onChange && onChange(v)
    });
  }));
}
Object.assign(__ds_scope, { Radio, RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const Magnify = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  width: 15,
  height: 15,
  fill: "currentColor",
  "aria-hidden": true
}, /*#__PURE__*/React.createElement("path", {
  d: "M13.35 13.3562C13.2566 13.4481 13.131 13.4998 13 13.5C12.8672 13.4994 12.7397 13.448 12.6437 13.3562L9.94372 10.65C8.80659 11.6051 7.34462 12.0844 5.86273 11.9878C4.38083 11.8912 2.99343 11.2263 1.98988 10.1316C0.986331 9.03698 0.444121 7.59717 0.476333 6.11248C0.508545 4.62779 1.11269 3.21286 2.16277 2.16277C3.21286 1.11269 4.62779 0.508545 6.11248 0.476333C7.59717 0.444121 9.03698 0.986331 10.1316 1.98988C11.2263 2.99343 11.8912 4.38083 11.9878 5.86273C12.0844 7.34462 11.6051 8.80659 10.65 9.94373L13.35 12.6437C13.3972 12.6903 13.4347 12.7457 13.4603 12.8069C13.486 12.868 13.4991 12.9337 13.4991 13C13.4991 13.0663 13.486 13.1319 13.4603 13.1931C13.4347 13.2542 13.3972 13.3097 13.35 13.3562Z"
}));
function SearchField({
  style,
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 13,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      color: 'var(--text-faint)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(Magnify, null)), /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    placeholder: rest.placeholder || 'Search…',
    style: {
      width: '100%',
      height: 'var(--field-h)',
      border: `1.5px solid ${focus ? 'var(--accent)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '0 12px 0 36px',
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-14)',
      background: 'var(--bg-field)',
      color: 'var(--text)',
      outline: 'none',
      boxShadow: focus ? 'var(--shadow-glow-accent)' : 'none',
      cursor: rest.disabled ? 'not-allowed' : 'text',
      opacity: rest.disabled ? 0.55 : 1,
      transition: 'border-color .15s, box-shadow .15s'
    }
  })));
}
Object.assign(__ds_scope, { SearchField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchField.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState,
  useRef,
  useEffect
} = React;
const Chev = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 12 8",
  width: 12,
  height: 8,
  fill: "currentColor",
  style: {
    transform: 'rotate(180deg)'
  },
  "aria-hidden": true
}, /*#__PURE__*/React.createElement("path", {
  d: "M5.99991 0.924943C5.89991 0.924943 5.80824 0.94161 5.72491 0.974943C5.64157 1.00828 5.55824 1.06661 5.47491 1.14994L0.524905 6.09994C0.391572 6.23328 0.329072 6.41244 0.337405 6.63744C0.345739 6.86244 0.416572 7.04161 0.549905 7.17494C0.716572 7.34161 0.895739 7.41244 1.08741 7.38744C1.27907 7.36244 1.44991 7.28328 1.59991 7.14994L5.99991 2.74994L10.3999 7.14994C10.5332 7.28328 10.7124 7.35828 10.9374 7.37494C11.1624 7.39161 11.3416 7.31661 11.4749 7.14994C11.6416 7.01661 11.7124 6.84161 11.6874 6.62494C11.6624 6.40828 11.5832 6.22494 11.4499 6.07494L6.5249 1.14994C6.44157 1.06661 6.35824 1.00828 6.2749 0.974943C6.19157 0.94161 6.09991 0.924943 5.99991 0.924943Z"
}));
function Select({
  label,
  value,
  options = [],
  onChange,
  placeholder = 'Select…',
  error,
  disabled,
  style,
  wrapperStyle,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const borderColor = error ? 'var(--error-500)' : open && !disabled ? 'var(--accent)' : 'var(--border-strong)';
  const current = options.find(o => (typeof o === 'string' ? o : o.value) === value);
  const label2 = current ? typeof current === 'string' ? current : current.label : placeholder;
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'relative',
      ...wrapperStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--fs-11)',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: error ? 'var(--error-500)' : 'var(--text-muted)',
      marginBottom: 6
    }
  }, label), /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onClick: () => !disabled && setOpen(v => !v)
  }, rest, {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      height: 'var(--field-h-lg)',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 'var(--radius-lg)',
      padding: '0 6px 0 12px',
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-15)',
      color: current ? 'var(--text)' : 'var(--text-muted)',
      background: 'var(--bg-field)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      transition: 'border-color .15s',
      ...style
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'left'
    }
  }, label2), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: 8,
      color: 'var(--text-faint)',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Chev, null))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '100%',
      marginTop: 6,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-pop)',
      overflow: 'hidden',
      zIndex: 30
    }
  }, options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    const isCurrent = v === value;
    return /*#__PURE__*/React.createElement("a", {
      key: v,
      href: "#",
      onClick: e => {
        e.preventDefault();
        onChange && onChange(v);
        setOpen(false);
      },
      onMouseEnter: e => e.currentTarget.style.background = 'var(--hover-bg-tint)',
      onMouseLeave: e => e.currentTarget.style.background = isCurrent ? 'var(--accent-soft)' : 'transparent',
      style: {
        display: 'block',
        padding: '10px 14px',
        fontFamily: 'var(--font-text)',
        fontSize: 'var(--fs-14)',
        textDecoration: 'none',
        color: isCurrent ? 'var(--accent)' : 'var(--text)',
        background: isCurrent ? 'var(--accent-soft)' : 'transparent'
      }
    }, l);
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function NavItem({
  icon,
  label,
  active,
  badge,
  arrow,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("a", _extends({
    href: "#"
  }, rest, {
    style: {
      display: 'flex',
      alignItems: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 'var(--fs-15)',
      color: active ? 'var(--accent)' : 'var(--text-sub)',
      background: active ? 'var(--accent-soft)' : 'transparent',
      border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '10px 12px',
      marginBottom: 6,
      textDecoration: 'none',
      cursor: 'pointer',
      transition: 'background .15s',
      ...style
    },
    onMouseEnter: e => {
      if (!active) e.currentTarget.style.background = 'var(--hover-bg-tint)';
    },
    onMouseLeave: e => {
      if (!active) e.currentTarget.style.background = 'transparent';
    }
  }), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      marginRight: 12,
      color: active ? 'var(--accent)' : 'var(--text-faint)',
      width: 20
    }
  }, icon), /*#__PURE__*/React.createElement("span", null, label), badge != null && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      minWidth: 18,
      height: 18,
      padding: '0 5px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--accent)',
      color: 'var(--on-accent)',
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-11)',
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, badge), arrow && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: badge != null ? 8 : 'auto',
      display: 'flex',
      transform: arrow === 'open' ? 'rotate(0deg)' : 'rotate(180deg)',
      color: 'var(--text-faint)',
      transition: 'transform .2s'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 12 8",
    width: 12,
    height: 8,
    fill: "currentColor",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 .9c-.1 0-.2 0-.3.1L.5 6c-.1.1-.2.3-.2.6 0 .2.1.4.2.5.2.2.4.3.6.2.2 0 .3-.1.5-.2L6 2.7l4.4 4.4c.1.1.3.2.5.2s.4-.1.5-.2c.2-.1.3-.3.2-.5 0-.2-.1-.4-.2-.5L6.5 1c-.1-.1-.2-.1-.3-.1z"
  }))));
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 26,
      borderBottom: '1.5px solid var(--divider)',
      ...style
    }
  }, items.map(it => {
    const v = typeof it === 'string' ? it : it.value;
    const l = typeof it === 'string' ? it : it.label;
    const active = v === value;
    return /*#__PURE__*/React.createElement("a", {
      key: v,
      href: "#",
      onClick: e => {
        e.preventDefault();
        onChange && onChange(v);
      },
      style: {
        textDecoration: 'none',
        cursor: 'pointer',
        paddingBottom: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontFamily: 'var(--font-display)',
        fontWeight: active ? 600 : 500,
        fontSize: 'var(--fs-14)',
        letterSpacing: '.3px',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        transition: 'color .15s'
      }
    }, l), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12,
        marginBottom: -1.5,
        height: 3,
        borderRadius: 3,
        background: active ? 'var(--accent)' : 'transparent'
      }
    }));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Toggle.jsx
try { (() => {
function Toggle({
  options = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      background: 'var(--bg-sunken)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-pill)',
      padding: 3,
      ...style
    }
  }, options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    const on = v === value;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      type: "button",
      onClick: () => onChange && onChange(v),
      style: {
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: 'var(--fs-12)',
        padding: '5px 13px',
        borderRadius: 'var(--radius-seg)',
        background: on ? 'var(--bg-panel)' : 'transparent',
        color: on ? 'var(--text)' : 'var(--text-muted)',
        boxShadow: on ? 'var(--shadow-toggle)' : 'none'
      }
    }, l);
  }));
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  title,
  action,
  padded = true,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      ...style
    }
  }), (title || action) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '18px 24px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-16)',
      letterSpacing: '-.2px',
      color: 'var(--text)'
    }
  }, title), action), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: padded ? '20px 24px 24px' : 0
    }
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Modal.jsx
try { (() => {
const Close = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  width: 14,
  height: 14,
  fill: "currentColor",
  "aria-hidden": true
}, /*#__PURE__*/React.createElement("path", {
  d: "M7 8.05L1.75 13.3c-.15.15-.325.225-.525.225s-.375-.075-.525-.225a.71.71 0 010-1.05L5.95 7 .7 1.75a.71.71 0 010-1.05C.85.55 1.025.475 1.225.475s.375.075.525.225L7 5.95l5.25-5.25c.15-.15.325-.225.525-.225s.375.075.525.225.225.325.225.525-.075.375-.225.525L8.05 7l5.25 5.25c.15.15.225.325.225.525s-.075.375-.225.525-.325.225-.525.225-.375-.075-.525-.225L7 8.05z"
}));
function Modal({
  open,
  title,
  onClose,
  actions,
  children,
  width = 420,
  style
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(36,31,26,.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      zIndex: 100
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: width,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-modal)',
      padding: '24px 26px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-20)',
      letterSpacing: '-.3px',
      color: 'var(--text)'
    }
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      border: 'none',
      background: 'transparent',
      color: 'var(--text-faint)',
      cursor: 'pointer',
      padding: 4,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Close, null))), children, actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 20
    }
  }, actions)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Modal.jsx", error: String((e && e.message) || e) }); }

// components/typography/SectionLabel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SectionLabel({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-11)',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      ...style
    }
  }), children);
}
Object.assign(__ds_scope, { SectionLabel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/SectionLabel.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IconButton({
  label,
  size = 34,
  active,
  disabled,
  style,
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({}, rest, {
    type: rest.type || 'button',
    "aria-label": label,
    disabled: disabled,
    onMouseEnter: e => {
      setHover(true);
      rest.onMouseEnter && rest.onMouseEnter(e);
    },
    onMouseLeave: e => {
      setHover(false);
      rest.onMouseLeave && rest.onMouseLeave(e);
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      padding: 0,
      border: '1.5px solid transparent',
      borderRadius: 'var(--radius-sm)',
      background: hover && !disabled ? 'var(--hover-bg-tint)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      transition: 'background var(--duration-base) var(--easing-standard),color var(--duration-base) var(--easing-standard)',
      ...style
    }
  }), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/icons/Eye.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Eye({
  size = 18,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("svg", _extends({}, rest, {
    viewBox: "0 0 20 20",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": true,
    style: style
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 4c-3.9 0-7.2 2.4-8.7 5.6a1 1 0 0 0 0 .8C2.8 13.6 6.1 16 10 16s7.2-2.4 8.7-5.6a1 1 0 0 0 0-.8C17.2 6.4 13.9 4 10 4Zm0 10.2c-3 0-5.6-1.8-6.9-4.2C4.4 7.6 7 5.8 10 5.8s5.6 1.8 6.9 4.2c-1.3 2.4-3.9 4.2-6.9 4.2Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "10",
    r: "2.6"
  }));
}
function EyeOff({
  size = 18,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("svg", _extends({}, rest, {
    viewBox: "0 0 20 20",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": true,
    style: style
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 4c-1.1 0-2.2.2-3.1.5l1.5 1.5c.5-.1 1.1-.2 1.6-.2 3 0 5.6 1.8 6.9 4.2-.6 1.1-1.5 2.1-2.5 2.8l1.3 1.3c1.4-1 2.5-2.4 3.2-3.7a1 1 0 0 0 0-.8C17.2 6.4 13.9 4 10 4Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.1 2.9 1.9 4.1l2.2 2.2c-1.1 1-2 2.2-2.6 3.3a1 1 0 0 0 0 .8C3 13.6 6.1 16 10 16c1.4 0 2.7-.3 3.9-.9l2.2 2.2 1.2-1.2L3.1 2.9Zm4.1 6.5 3.4 3.4a2.6 2.6 0 0 1-3.4-3.4Zm-1.3-1.3 1 1a4.4 4.4 0 0 0 5.9 5.9l.9.9c-.8.2-1.7.3-2.6.3-3 0-5.6-1.8-6.9-4.2.6-1.2 1.5-2.2 2.6-2.9Z"
  }));
}
Object.assign(__ds_scope, { Eye, EyeOff });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icons/Eye.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/AuthLayout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const Wordmark = () => /*#__PURE__*/React.createElement("div", {
  style: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 'var(--fs-24)',
    letterSpacing: '-.5px',
    color: 'var(--text)'
  }
}, "Team", /*#__PURE__*/React.createElement("span", {
  style: {
    color: 'var(--accent)'
  }
}, "merly"), /*#__PURE__*/React.createElement("span", {
  style: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: 2,
    background: 'var(--amber-500)',
    marginLeft: 3,
    verticalAlign: 'middle'
  }
}));
function AuthLayout({
  title,
  subtitle,
  footer,
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      minHeight: '100vh',
      width: '100%',
      boxSizing: 'border-box',
      background: 'var(--bg)',
      padding: 'var(--sp-12) var(--sp-8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--sp-10)',
      ...style
    }
  }), /*#__PURE__*/React.createElement(Wordmark, null), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 480,
      boxSizing: 'border-box',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-card)',
      padding: 'var(--sp-16)'
    }
  }, title && /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-22)',
      letterSpacing: '-.2px',
      color: 'var(--text)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-14)',
      lineHeight: 'var(--lh-normal)',
      color: 'var(--text-muted)'
    }
  }, subtitle), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: title || subtitle ? 'var(--sp-12)' : 0
    }
  }, children)), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-text)',
      fontSize: 'var(--fs-14)',
      color: 'var(--text-muted)'
    }
  }, footer));
}
Object.assign(__ds_scope, { AuthLayout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/AuthLayout.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.InfoBanner = __ds_scope.InfoBanner;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.SearchField = __ds_scope.SearchField;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.SectionLabel = __ds_scope.SectionLabel;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Eye = __ds_scope.Eye;

__ds_ns.EyeOff = __ds_scope.EyeOff;

__ds_ns.AuthLayout = __ds_scope.AuthLayout;

__ds_ns.Spinner = __ds_scope.Spinner;

})();
