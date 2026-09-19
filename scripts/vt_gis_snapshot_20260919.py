"""Real elevator records from VT's public Facilities GIS ("Critical Elevators"
layer, arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/CriticalElevators),
fetched live 2026-09-19 and transcribed here for the merge script. Not fabricated -
this is the raw attribute data returned by that service, filtered to the 16 pilot
buildings by building_number.
"""

# (building_number, elevator_id, floor_access, type, status, edited_ms)
RAW = [
    ("0153", "00153-ELEV-HYD-0001", "0,1,2,3", "Passenger", "Reported as Functional", 1775565321000),
    ("0153", "00153-ELEV-HYD-0002", "0,1,2,3", "Passenger", "Reported as Functional", 1775565317000),
    ("0176", "00176-ELEV-TRC-0001", "1,2,3", "Passenger", "Reported as Functional", 1775573678000),
    ("0134", "00134-ELEV-TRC-0002", "1,2,3,4,5,6", "Freight", "Reported as Functional", 1777657531000),
    ("0134", "00134-ELEV-TRC-0001", "1,2,3,4,5,6", "Passenger", "Closed for repairs", 1777657446000),
    ("0151", "00151-ELEV-TRC-0001", "1,2,3,4,5,6", "Passenger", "Closed for repairs", 1788869830000),
    ("0188", "00188-ELEV-HYD-0003", "1,2", "Passenger", "Reported as Functional", 1775574847000),
    ("0177", "00177-ELEV-TRC-0001", "1,2,3,4,5,6", "Passenger", "Reported as Functional", 1775561180000),
    ("0180", "00180-ELEV-HYD-7116", "1,2,3", "Passenger", "Reported as Functional", 1776093475000),
    ("0155", "00155-ELEV-TRC-0001", "1,2,3,4,5", "Passenger", "Reported as Functional", 1775576820000),
    ("0174", "00174-ELEV-HYD-0002", "1,2,3", "Passenger", "Reported as Functional", 1776964923000),
    ("0177", "00177-ELEV-TRC-0004", "1,2,3,4,5", "Passenger", "Reported as Functional", 1775561119000),
    ("0155", "00155-ELEV-TRC-0002", "1,2,3,4,5", "Passenger", "Reported as Functional", 1775576837000),
    ("0176", "00176-ELEV-HYD-0002", "1,2,3", "Passenger", "Reported as Functional", 1785333771000),
    ("0133C", "0133C-ELEV-HYD-0001", "0,1,2", "Passenger", "Reported as Functional", 1775587529000),
    ("0129", "00129-ELEV-HYD-0001", "1,2,3,4", "Passenger", "Reported as Functional", 1780596453000),
    ("0126", "00126-ELEV-HYD-0002", "1,2,3,4", "Passenger", "Closed for repairs", 1775586439000),
    ("0151", "00151-ELEV-TRC-0002", "1,2,3,4,5,6", "Passenger", "Closed for repairs", 1788892138000),
    ("0188", "00188-ELEV-HYD-0006", "1,2,3,4,5", "Passenger", "Reported as Functional", 1775574550000),
    ("0188", "00188-ELEV-HYD-0004", "1,2", "Passenger", "Reported as Functional", 1775574581000),
    ("0188", "00188-ELEV-TRC-0002", "1,2,3", "Passenger", "Reported as Functional", 1775574490000),
    ("0188", "00188-ELEV-TRC-0001", "1,2,3", "Passenger", "Reported as Functional", 1775574450000),
    ("0177", "00177-ELEV-TRC-0002", "1,2,3,4,5,6", "Passenger", "Closed for repairs", 1787766103000),
    ("0136", "00136-ELEV-TRC-0002", "1,2,3,4", "Passenger", "Closed for repairs", 1789568498000),
    ("0136", "00136-ELEV-TRC-0001", "1,2,3,4", "Passenger", "Reported as Functional", 1775587063000),
    ("0151", "00151-ELEV-CHR-0001", "1", "Chair Lift", "Closed for repairs", 1788460333000),
    ("0176", "00176-ELEV-CHR-0001", "1", "Chair Lift", "Reported as Functional", 1775823238000),
    ("0176", "00176-ELEV-STR-0001", "2", "Chair Lift", "Reported as Functional", 1775823142000),
    ("0180", "00180-ELEV-HYD-0004", "1,2", "Freight", "Closed for repairs", 1776788373000),
    ("0137", "00137-ELEV-0001", "1,2,3,4,5", "Passenger", "Reported as Functional", 1784652135000),
    ("0137", "00137-ELEV-0002", "1,2,3,4", "Passenger", "Reported as Functional", 1775576539000),
    ("0188", "00188-ELEV-0005", "0,1", "Passenger", "Reported as Functional", 1775574612000),
]

BUILDING_ID_BY_NUM = {
    "0136": "VT-GOODWIN", "0126": "VT-DURHAM", "0134": "VT-WHITTEMORE", "0151": "VT-MCBRYDE",
    "0133C": "VT-HANCOCK", "0174": "VT-TORGERSEN", "0180": "VT-SQUIRES", "0176": "VT-BURRUSS",
    "0177": "VT-NEWMAN-LIB", "0137": "VT-DDS", "0129": "VT-KELLY", "0188": "VT-CFA",
    "0168": "VT-HITT", "0133": "VT-MITCHELL", "0155": "VT-DERRING", "0153": "VT-PAMPLIN",
}

# building_id -> short node-id suffix already used in entrances/paths/connectors.geojson
NODE_SUFFIX = {
    "VT-GOODWIN": "GOODWIN", "VT-DURHAM": "DURHAM", "VT-WHITTEMORE": "WHITTEMORE", "VT-MCBRYDE": "MCBRYDE",
    "VT-HANCOCK": "HANCOCK", "VT-TORGERSEN": "TORGERSEN", "VT-SQUIRES": "SQUIRES", "VT-BURRUSS": "BURRUSS",
    "VT-NEWMAN-LIB": "NEWMAN-LIB", "VT-DDS": "DDS", "VT-KELLY": "KELLY", "VT-CFA": "CFA",
    "VT-DERRING": "DERRING", "VT-PAMPLIN": "PAMPLIN",
}
