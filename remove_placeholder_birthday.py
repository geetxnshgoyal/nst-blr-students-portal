import json

file_path = 'students.json'

try:
    with open(file_path, 'r') as f:
        data = json.load(f)

    updated_count = 0
    for student in data:
        if student.get('birthday') == "01-01-2000":
            student['birthday'] = ""
            updated_count += 1

    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)

    print(f"Successfully cleared placeholder birthdays for {updated_count} students.")

except Exception as e:
    print(f"Error: {e}")
