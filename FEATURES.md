# Production Planner Features

## 🎯 **How to Access the New Features**

### **Production Planner (Main Interface)**
1. Navigate to **"Production Planner"** from the main dashboard
2. Click the **"Show Management"** button in the top-right corner
3. You'll see options for:
   - **Holiday Management** - Add/manage holidays
   - **Line Management** - Add/remove/edit production lines
   - **Line Grouping** - Group lines and manage capacity

## 🏭 **Production Line Management**

### **Adding New Lines**
1. Click **"Show Management"** → **"Add Line"** button
2. Fill in:
   - **Line Name** (e.g., "Line A - Knitwear")
   - **Capacity** (daily production capacity)
3. Click **"Add Line"**

### **Editing Lines**
1. In the Production Lines sidebar, click the **Edit** button (pencil icon)
2. Modify the name or capacity
3. Click **"Save"** to confirm changes

### **Removing Lines**
1. Click the **Delete** button (trash icon) next to any line
2. Confirm the deletion

## 🎄 **Holiday Management**

### **Adding Holidays**
1. Click **"Show Management"** → **"Add Holiday"** button
2. Select a date from the calendar
3. Enter the holiday name
4. Choose:
   - **Global Holiday** (affects all lines)
   - **Line-specific** (select which lines are affected)
5. Click **"Add Holiday"**

### **Managing Holidays**
- View all holidays in the sidebar with their dates and scope
- Delete holidays using the trash icon
- See which lines are affected by each holiday
- Holidays automatically block scheduling on affected dates

## 👥 **Line Grouping**

### **Creating Groups**
1. Click **"Show Management"** → **"Create Group"** button
2. Enter a group name
3. Select which ungrouped lines to include
4. Click **"Create Group"**

### **Managing Groups**
1. In the Production Lines sidebar, you can:
   - **Expand/Collapse** groups to show/hide individual lines
   - **Remove lines** from groups
   - **Delete entire groups**
   - **Edit individual lines** within groups

### **Group Features**
- **Expand/Collapse**: Click the chevron icon to show/hide lines in a group
- **Group Selection**: Select all lines in a group with one click
- **Visual Hierarchy**: Grouped lines are clearly distinguished from ungrouped ones

## 📊 **Visual Indicators**

### **Status Display**
- **Quick Actions panel** shows: `X holidays • Y lines • Z groups`
- **Line Filter** shows: `X/Y selected` for line selection
- **Groups** show: `X/Y selected` for lines within each group

### **Line Filter Enhancement**
- **Drag & Drop**: Reorder lines by dragging
- **Checkboxes**: Select/deselect individual lines
- **Group Controls**: Expand/collapse groups
- **Capacity Display**: Shows capacity for each line

## 🔄 **Workflow Integration**

### **Holiday-Aware Scheduling**
- The system automatically considers holidays when scheduling orders
- Orders are rescheduled around holidays using the **"Refresh Plan"** button
- Holiday conflicts are detected and resolved automatically

### **Line Capacity Management**
- Each line has its own capacity setting
- Capacity is considered during order scheduling
- Visual indicators show line utilization

### **Grouped Line Management**
- Groups help organize related production lines
- Collapsed groups show summary information
- Individual lines can be managed within groups

## 📦 **Purchase Management**

### **Purchase Orders vs Purchase Holds**
- **Purchase Orders**: Active orders ready to be scheduled
- **Purchase Holds**: Orders temporarily on hold with hold reasons
- **Both are draggable**: Can schedule either type when ready
- **Visual Distinction**: Purchase Orders (blue), Purchase Holds (orange)
- **Hold Information**: Shows hold reason when available

### **Scheduling from Holds**
- Drag Purchase Holds to calendar when ready to proceed
- System treats them like regular Purchase Orders once scheduled
- Hold reason displayed for reference

## 🚀 **Getting Started**

1. **Start with Lines**: Add your production lines with their capacities
2. **Add Holidays**: Set up your holiday calendar (no default holidays)
3. **Create Groups**: Organize lines into logical groups
4. **Sync Orders**: Get Purchase Orders and Purchase Holds from Odoo
5. **Schedule Orders**: Use the drag-and-drop interface to schedule orders
6. **Manage Capacity**: Monitor and adjust line capacities as needed

## 💡 **Tips**

- Use **Global Holidays** for company-wide holidays
- Use **Line-specific holidays** for maintenance or specialized line downtime
- Group similar lines together (e.g., "Knitwear Lines", "Woven Lines")
- Keep groups expanded during active planning, collapse for overview
- Use the **"Refresh Plan"** button after adding holidays to reschedule automatically

---

The system is now fully equipped with manual holiday management, flexible line management, and intelligent grouping capabilities!