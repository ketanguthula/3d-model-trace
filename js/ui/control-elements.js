export function createControlSection(container, title) {
    const section = document.createElement('section');
    section.className = 'control-section';

    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    container.appendChild(section);
    return section;
}

export function appendCheckboxControl(container, checkbox, label) {
    const row = document.createElement('div');
    row.className = 'checkbox-control';
    row.append(checkbox, label);
    container.appendChild(row);
}
