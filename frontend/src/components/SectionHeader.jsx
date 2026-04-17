/**
 * SectionHeader Component
 * Displays a section title with description and helpful context
 */
export default function SectionHeader({ 
  title, 
  description, 
  icon,
  subtitle,
  docLink
}) {
  return (
    <div className="section-header">
      <div className="section-header-content">
        <div className="section-header-title-block">
          {icon && <span className="section-header-icon">{icon}</span>}
          <div>
            <h2 className="section-header-title">{title}</h2>
            {subtitle && <p className="section-header-subtitle">{subtitle}</p>}
          </div>
        </div>
        {description && (
          <p className="section-header-description">
            {description}
          </p>
        )}
      </div>
      {docLink && (
        <a href={docLink} target="_blank" rel="noopener noreferrer" className="section-header-link">
          Learn more →
        </a>
      )}
    </div>
  );
}
